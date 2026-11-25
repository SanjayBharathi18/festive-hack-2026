import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import {
  boardPostCreateSchema,
  boardPostPatchSchema,
  emailCodeCheckSchema,
  emailCodeStartSchema,
  interestBodySchema,
  type BoardPostPage,
  type BulkStores,
  type DeskBoardPost,
  type DeskBoardPosts,
  type EmailProof,
  type InterestAnswer,
} from "../../shared/bulk.ts";
import { cityQuerySchema, sameCity } from "../../shared/cities.ts";
import { addDays, istDay, type Day } from "../../shared/day.ts";
import { toSarvamLanguage, type AppLanguage } from "../../shared/languages.ts";
import { storeQuerySchema } from "../../shared/store.ts";
import type { VerifyStartAnswer } from "../../shared/verify.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, errorResponse, type AppError } from "../http/errors.ts";
import { parseInput, readJson } from "../http/input.ts";
import { publishedStoreById } from "../stores/store-data.ts";
import { createTranslator } from "../translate/translator.ts";
import { codeRules, createCodes } from "../verify/codes.ts";
import { deskAuth, refuseOtherSites } from "../verify/desk-auth.ts";
import { createSessions } from "../verify/sessions.ts";
import { checkError } from "../verify/verify-routes.ts";
import {
  boardPost,
  createBoardData,
  newBoardToken,
  type BoardPostRow,
} from "./board-data.ts";
import { bulkStores } from "./bulk-data.ts";

type BulkDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "limits"
  | "idempotent"
  | "flags"
  | "sarvam"
  | "metrics"
  | "log"
  | "stopping"
>;

// The latest need-by day of a new post: a board post is for a coming
// festival or event, not for next year.
export const needByWindowDays = 180;

// The Bulk and corporate tab, the request board of the companies, and the
// request board on the desks of stores with a bulk section.
export function bulkRoutes(deps: BulkDeps): Hono<AppEnv> {
  const { db, clock, config, limits, idempotent, flags } = deps;
  const secret = config.SESSION_SECRET;
  const publicOrigin = new URL(config.PUBLIC_URL).origin;
  const codes = createCodes({ db, clock, secret });
  const sessions = createSessions({ db, clock, secret });
  const boards = createBoardData(db);
  const translator = createTranslator(deps);
  const auth = deskAuth(deps);
  const sellerLanguage = db
    .prepare("SELECT language FROM sellers WHERE id = ?")
    .pluck();
  const exampleToken = db
    .prepare(
      "SELECT token FROM board_posts WHERE is_demo = 1 ORDER BY created_at LIMIT 1",
    )
    .pluck();
  const today = () => istDay(clock.now());

  const postOf = (token: string): BoardPostRow => {
    const row = boards.byToken(token);
    if (row === undefined) {
      throw appError(
        404,
        "not_found",
        "No board post has this link. Check the link in your message.",
      );
    }
    return row;
  };

  const page = async (
    row: BoardPostRow,
    signal: AbortSignal,
  ): Promise<BoardPostPage> => ({
    token: row.token,
    today: today(),
    post: boardPost(row, today()),
    interests: await Promise.all(
      boards.interests(row.id).map(async (interest) => ({
        store: interest.store,
        note: interest.note,
        note_translation: await translator.translate(
          interest.note,
          row.language,
          { from: interest.note_language, signal },
        ),
        created_at: interest.created_at,
      })),
    ),
  });

  const checkNeedBy = (needBy: Day) => {
    if (needBy < today()) {
      throw appError(
        400,
        "day_past",
        "This day has passed. Choose a later need-by day.",
      );
    }
    if (needBy > addDays(today(), needByWindowDays)) {
      throw appError(
        400,
        "day_too_far",
        `Choose a need-by day in the next ${needByWindowDays} days.`,
      );
    }
  };

  return new Hono<AppEnv>()
    .get("/api/bulk/stores", limits.searches, async (c) => {
      const lang = storeQuerySchema.safeParse(c.req.query()).data?.lang;
      const { city } = parseInput(cityQuerySchema, c.req.query());
      const stores = bulkStores(db, city ?? null);
      if (lang !== undefined) {
        const values = await flags.environment(c.req.raw.signal);
        c.set("flagVariants", {
          ...c.get("flagVariants"),
          ops_transliteration: values.ops_transliteration,
        });
      }
      const names =
        lang === undefined
          ? new Map<string, string>()
          : await translator.scriptNames(
              stores.flatMap(({ items }) => items),
              lang,
              { signal: c.req.raw.signal },
            );
      const answer: BulkStores = {
        stores: stores.map((entry) => ({
          ...entry,
          items: entry.items.map((item) => ({
            ...item,
            name_script: names.get(item.id) ?? null,
          })),
        })),
        example_post: (exampleToken.get() as string | undefined) ?? null,
      };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .post("/api/board-posts/email/start", limits.codes, async (c) => {
      const { email } = await readJson(c, emailCodeStartSchema);
      const started = codes.start(email, "work_email");
      if (!started.ok) {
        const minutes = Math.ceil(started.retryAfterMs / 60_000);
        c.header("Retry-After", String(Math.ceil(started.retryAfterMs / 1000)));
        return errorResponse(
          c,
          429,
          "rate_limited",
          `This email got ${codeRules.perTarget} codes in the last 15 minutes. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        );
      }
      const answer: VerifyStartAnswer = {
        prototype: true,
        code: started.code,
        expires_at: started.expiresAt,
      };
      return c.json(answer, 201);
    })
    .post("/api/board-posts/email/check", async (c) => {
      refuseOtherSites(c, publicOrigin);
      const { email, code } = await readJson(c, emailCodeCheckSchema);
      const result = codes.check(email, "work_email", code);
      if (!result.ok) throw checkError(result);
      const proof = sessions.open("work_email", email);
      const answer: EmailProof = {
        proof: proof.token,
        expires_at: proof.expiresAt,
      };
      return c.json(answer);
    })
    .post("/api/board-posts", idempotent, async (c) => {
      const body = await readJson(c, boardPostCreateSchema);
      const phone = sessions.find("order", body.proof);
      if (phone === undefined) throw proofError("phone");
      const email = sessions.find("work_email", body.email_proof);
      if (email === undefined) throw proofError("email");
      checkNeedBy(body.need_by);
      const id = randomUUID();
      db.transaction(() => {
        if (!sessions.close("order", body.proof)) throw proofError("phone");
        if (!sessions.close("work_email", body.email_proof)) {
          throw proofError("email");
        }
        boards.insert({
          ...body,
          id,
          token: newBoardToken(),
          buyerPhone: phone.subject,
          workEmail: email.subject,
          isDemo: false,
          createdAt: clock.now(),
        });
      })();
      const row = boards.byId(id);
      if (row === undefined)
        throw new Error("The new board post was not saved.");
      return c.json(await page(row, c.req.raw.signal), 201);
    })
    .get("/api/board-posts/:token", async (c) => {
      const row = postOf(c.req.param("token"));
      c.header("Cache-Control", "no-store");
      return c.json(await page(row, c.req.raw.signal));
    })
    .patch("/api/board-posts/:token", async (c) => {
      const row = postOf(c.req.param("token"));
      const patch = await readJson(c, boardPostPatchSchema);
      if (row.is_demo === 1) {
        throw appError(
          403,
          "forbidden",
          "The example request stays as it is for every visitor. Post your own request to change one.",
        );
      }
      const post = boardPost(row, today());
      const now = clock.now();
      switch (patch.action) {
        case "edit":
          if (post.status === "closed") throw closedError();
          checkNeedBy(patch.post.need_by);
          boards.edit(row.id, patch.post, now);
          break;
        case "close":
          if (post.status === "open") boards.setStatus(row.id, "closed", now);
          break;
        case "reopen":
          if (row.need_by < today()) throw closedError();
          if (row.status === "closed") boards.setStatus(row.id, "open", now);
          break;
      }
      return c.json(await page(postOf(row.token), c.req.raw.signal));
    })
    .get("/api/desk/board-posts", auth, async (c) => {
      const desk = c.get("desk");
      const store = publishedStoreById(db, desk.storeId);
      if (store === undefined) throw storeMissing();
      const language = sellerLanguage.get(desk.sellerId) as AppLanguage;
      if (!store.bulk_on || store.city === null) {
        const off: DeskBoardPosts = {
          bulk_on: store.bulk_on,
          city: store.city,
          posts: [],
        };
        return c.json(off);
      }
      const answers = boards.interestsOfStore(store.id);
      const signal = c.req.raw.signal;
      const posts = await Promise.all(
        boards
          .openInCity(store.city, today())
          .map(async (row): Promise<DeskBoardPost> => {
            const post = boardPost(row, today());
            const options = { from: row.language, signal };
            const [description, ...names] = await Promise.all([
              translator.translate(post.description, language, options),
              ...post.items.map(({ name }) =>
                translator.translate(name, language, options),
              ),
            ]);
            return {
              id: post.id,
              company_name: post.company_name,
              description: post.description,
              description_translation: description ?? null,
              items: post.items.map((item, index) => ({
                ...item,
                name_translation: names[index] ?? null,
              })),
              need_by: post.need_by,
              places: post.places,
              budget_per_unit: post.budget_per_unit,
              city: post.city,
              is_demo: post.is_demo,
              created_at: post.created_at,
              interest: answers.get(post.id) ?? null,
            };
          }),
      );
      const answer: DeskBoardPosts = {
        bulk_on: true,
        city: store.city,
        posts,
      };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .post("/api/desk/board-posts/:id/interest", auth, idempotent, async (c) => {
      const desk = c.get("desk");
      const { note } = await readJson(c, interestBodySchema);
      const store = publishedStoreById(db, desk.storeId);
      if (store === undefined) throw storeMissing();
      if (!store.bulk_on) {
        throw appError(
          403,
          "forbidden",
          "Turn on your bulk section to answer board posts.",
        );
      }
      const row = boards.byId(c.req.param("id"));
      if (
        row === undefined ||
        store.city === null ||
        !sameCity(row.city, store.city)
      ) {
        throw appError(
          404,
          "not_found",
          "This board post is not on your request board. Reload the board.",
        );
      }
      if (boardPost(row, today()).status === "closed") throw closedError();
      const language = sellerLanguage.get(desk.sellerId) as AppLanguage;
      boards.answer({
        postId: row.id,
        storeId: store.id,
        note,
        noteLanguage: note === null ? null : toSarvamLanguage(language),
        createdAt: clock.now(),
      });
      const interest = boards.interestOf(row.id, store.id);
      if (interest === undefined) throw new Error("The answer was not saved.");
      const answer: InterestAnswer = { post_id: row.id, interest };
      return c.json(answer, 201);
    });
}

function closedError(): AppError {
  return appError(
    409,
    "order_closed",
    "This board post is closed, so it cannot change now.",
  );
}

function storeMissing(): AppError {
  return appError(404, "not_found", "Your store is not on the app yet.");
}

function proofError(which: "phone" | "email"): AppError {
  return appError(
    401,
    "proof_invalid",
    which === "phone"
      ? "Verify your WhatsApp number again: ask for a new code."
      : "Verify your work email again: ask for a new code.",
  );
}
