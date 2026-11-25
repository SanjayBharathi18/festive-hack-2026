import { randomUUID } from "node:crypto";
import { Hono, type Context } from "hono";
import {
  verifyCheckBodySchema,
  verifyStartBodySchema,
  type CodePurpose,
  type VerifyCheckAnswer,
  type VerifyStartAnswer,
} from "../../shared/verify.ts";
import type { RouteDeps } from "../app.ts";
import { heroSlug } from "../demo/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, errorResponse, type AppError } from "../http/errors.ts";
import { readJson } from "../http/input.ts";
import { codeRules, createCodes, type CheckResult } from "./codes.ts";
import { refuseOtherSites, signInDesk } from "./desk-auth.ts";
import { createSessions } from "./sessions.ts";

type VerifyDeps = Pick<RouteDeps, "db" | "clock" | "config" | "limits">;

export function verifyRoutes({
  db,
  clock,
  config,
  limits,
}: VerifyDeps): Hono<AppEnv> {
  const secret = config.SESSION_SECRET;
  const publicOrigin = new URL(config.PUBLIC_URL).origin;
  const codes = createCodes({ db, clock, secret });
  const sessions = createSessions({ db, clock, secret });
  const sellerByPhone = db
    .prepare(
      "SELECT sellers.id FROM sellers JOIN stores ON stores.seller_id = sellers.id WHERE sellers.phone = ? LIMIT 1",
    )
    .pluck();
  const storeOfSeller = db.prepare(
    "SELECT slug, name FROM stores WHERE seller_id = ? ORDER BY rowid LIMIT 1",
  );
  const heroSeller = db
    .prepare(
      "SELECT 1 FROM sellers JOIN stores ON stores.seller_id = sellers.id WHERE sellers.phone = ? AND stores.slug = ? AND stores.is_demo = 1",
    )
    .pluck();
  const anySellerByPhone = db
    .prepare("SELECT id FROM sellers WHERE phone = ?")
    .pluck();
  const addSeller = db.prepare(
    "INSERT INTO sellers (id, phone, language) VALUES (?, ?, 'en') ON CONFLICT (phone) DO NOTHING",
  );
  const storeToPublish = db.prepare(
    `SELECT stores.id, stores.slug, stores.name,
      sellers.verified_at IS NOT NULL AS published
    FROM stores JOIN sellers ON sellers.id = stores.seller_id
    WHERE stores.seller_id = ? ORDER BY stores.rowid LIMIT 1`,
  );

  // A publish code makes her seller record on first use and signs her in.
  // Her store stays private until she publishes it.
  const signInToPublish = async (
    c: Context<AppEnv>,
    phone: string,
  ): Promise<VerifyCheckAnswer> => {
    addSeller.run(randomUUID(), phone);
    const sellerId = anySellerByPhone.get(phone) as string;
    await signInDesk(c, { sessions, config }, sellerId);
    const store = storeToPublish.get(sellerId) as
      { id: string; slug: string; name: string; published: number } | undefined;
    return {
      purpose: "publish",
      store:
        store === undefined
          ? null
          : { ...store, published: store.published === 1 },
    };
  };

  const sellerOf = (phone: string): string => {
    const sellerId = sellerByPhone.get(phone) as string | undefined;
    if (sellerId === undefined) {
      throw appError(
        404,
        "seller_not_found",
        "No store uses this WhatsApp number. Check the number.",
      );
    }
    return sellerId;
  };

  // The numbers of the demo sellers are public in fixtures/demo.json, and in
  // this build the code shows on the screen, so the store of the demo desk token
  // opens only by that token.
  const refuseHeroSeller = (phone: string, purpose: CodePurpose) => {
    if (purpose !== "desk" && purpose !== "publish") return;
    if (heroSeller.get(phone, heroSlug) === undefined) return;
    throw appError(
      403,
      "use_demo_link",
      "This number belongs to the demo store, which opens only from the demo desk link. Open that link, or use your own number.",
    );
  };

  return new Hono<AppEnv>()
    .post("/api/verify/start", limits.codes, async (c) => {
      const { phone, purpose } = await readJson(c, verifyStartBodySchema);
      refuseHeroSeller(phone, purpose);
      if (purpose === "desk") sellerOf(phone);
      const started = codes.start(phone, purpose);
      if (!started.ok) {
        const minutes = Math.ceil(started.retryAfterMs / 60_000);
        c.header("Retry-After", String(Math.ceil(started.retryAfterMs / 1000)));
        return errorResponse(
          c,
          429,
          "rate_limited",
          `This number got ${codeRules.perTarget} codes in the last 15 minutes. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        );
      }
      const answer: VerifyStartAnswer = {
        prototype: true,
        code: started.code,
        expires_at: started.expiresAt,
      };
      return c.json(answer, 201);
    })
    .post("/api/verify/check", async (c) => {
      refuseOtherSites(c, publicOrigin);
      const { phone, purpose, code } = await readJson(c, verifyCheckBodySchema);
      refuseHeroSeller(phone, purpose);
      const sellerId = purpose === "desk" ? sellerOf(phone) : undefined;
      const result = codes.check(phone, purpose, code);
      if (!result.ok) throw checkError(result);
      if (purpose === "publish") return c.json(await signInToPublish(c, phone));
      if (sellerId === undefined) {
        const proof = sessions.open("order", phone);
        const answer: VerifyCheckAnswer = {
          purpose: "order",
          proof: proof.token,
          expires_at: proof.expiresAt,
        };
        return c.json(answer);
      }
      await signInDesk(c, { sessions, config }, sellerId);
      const store = storeOfSeller.get(sellerId) as {
        slug: string;
        name: string;
      };
      const answer: VerifyCheckAnswer = { purpose: "desk", store };
      return c.json(answer);
    });
}

export function checkError(
  result: Exclude<CheckResult, { ok: true }>,
): AppError {
  switch (result.reason) {
    case "wrong":
      return appError(
        400,
        "code_wrong",
        result.triesLeft > 0
          ? `This code is not right. Check it and try again: ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.`
          : "This code is not right, and it has no tries left. Ask for a new code.",
      );
    case "expired":
      return appError(
        400,
        "code_expired",
        "This code has expired. Ask for a new code.",
      );
    case "used":
      return appError(
        400,
        "code_used",
        "This code was already used. Ask for a new code.",
      );
    case "tries_used":
      return appError(
        400,
        "code_tries_used",
        `This code had ${codeRules.tries} wrong tries. Ask for a new code.`,
      );
  }
}
