import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Clock } from "../clock.ts";
import type { Config } from "../config.ts";
import type { Db } from "../db/database.ts";
import { heroSlug } from "../demo/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { appError } from "../http/errors.ts";
import { createSessions, sessionRules, type Sessions } from "./sessions.ts";

export type DeskAccess = {
  storeId: string;
  sellerId: string;
  slug: string;
  isDemo: boolean;
  via: "session" | "demo";
};

export type DeskEnv = {
  Bindings: AppEnv["Bindings"];
  Variables: AppEnv["Variables"] & { desk: DeskAccess };
};

export type SellerEnv = {
  Bindings: AppEnv["Bindings"];
  Variables: AppEnv["Variables"] & { sellerId: string };
};

type DeskDeps = { db: Db; clock: Clock; config: Config };

type StoreRow = {
  id: string;
  seller_id: string;
  slug: string;
  is_demo: number;
};

export const deskCookie = "__Host-desk_session";
export const demoTokenHeader = "X-Demo-Token";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function deskAuth({
  db,
  clock,
  config,
}: DeskDeps): MiddlewareHandler<DeskEnv> {
  const sessions = createSessions({
    db,
    clock,
    secret: config.SESSION_SECRET,
  });
  const storeOfSeller = db.prepare(
    "SELECT id, seller_id, slug, is_demo FROM stores WHERE seller_id = ? ORDER BY rowid LIMIT 1",
  );
  const demoStore = db.prepare(
    "SELECT id, seller_id, slug, is_demo FROM stores WHERE slug = ? AND is_demo = 1",
  );
  const cookieKey = deskCookieKey(config.SESSION_SECRET);
  const publicOrigin = new URL(config.PUBLIC_URL).origin;

  return async (c, next) => {
    refuseOtherSites(c, publicOrigin);
    const demoToken =
      c.req.header(demoTokenHeader) ??
      (c.req.method === "GET" ? c.req.query("demo") : undefined);
    if (demoToken !== undefined) {
      const expected = config.DEMO_DESK_TOKEN;
      if (expected === undefined || !sameSecret(demoToken, expected)) {
        throw appError(
          401,
          "not_signed_in",
          expected === undefined
            ? "This server has no demo desk. Sign in with your WhatsApp number."
            : "This demo link is not valid. Check the link, or sign in with your WhatsApp number.",
        );
      }
      const store = demoStore.get(heroSlug) as StoreRow | undefined;
      if (store === undefined) {
        throw appError(
          404,
          "not_found",
          "The demo store is not set up on this server. Restart the server to load the demo seed.",
        );
      }
      c.set("desk", access(store, "demo"));
      c.set("idempotencyScope", store.id);
      return next();
    }
    const token = await getSignedCookie(c, cookieKey, deskCookie);
    const session =
      typeof token === "string" ? sessions.find("desk", token) : undefined;
    const store =
      session && (storeOfSeller.get(session.subject) as StoreRow | undefined);
    if (!store) {
      throw appError(
        401,
        "not_signed_in",
        "Sign in to your desk with your WhatsApp number and a code.",
      );
    }
    c.set("desk", access(store, "session"));
    c.set("idempotencyScope", store.id);
    return next();
  };
}

// The seller session alone, for seller setup: right after her publish code,
// she has a session but no store yet. The demo token opens nothing here.
export function sellerAuth({
  db,
  clock,
  config,
}: DeskDeps): MiddlewareHandler<SellerEnv> {
  const sessions = createSessions({
    db,
    clock,
    secret: config.SESSION_SECRET,
  });
  const cookieKey = deskCookieKey(config.SESSION_SECRET);
  const publicOrigin = new URL(config.PUBLIC_URL).origin;

  return async (c, next) => {
    refuseOtherSites(c, publicOrigin);
    const token = await getSignedCookie(c, cookieKey, deskCookie);
    const session =
      typeof token === "string" ? sessions.find("desk", token) : undefined;
    if (session === undefined) {
      throw appError(
        401,
        "not_signed_in",
        "Verify your WhatsApp number with a code, then try again.",
      );
    }
    c.set("sellerId", session.subject);
    c.set("idempotencyScope", session.subject);
    return next();
  };
}

export async function signInDesk(
  c: Context<AppEnv>,
  { sessions, config }: { sessions: Sessions; config: Config },
  sellerId: string,
): Promise<void> {
  const { token } = sessions.open("desk", sellerId);
  await setSignedCookie(
    c,
    deskCookie,
    token,
    deskCookieKey(config.SESSION_SECRET),
    {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: sessionRules.desk.ttlMs / 1000,
    },
  );
}

export function refuseOtherSites(c: Context, publicOrigin: string): void {
  if (safeMethods.has(c.req.method)) return;
  const site = c.req.header("Sec-Fetch-Site");
  const origin = c.req.header("Origin");
  const foreign =
    site === undefined
      ? origin !== undefined && origin !== publicOrigin
      : site !== "same-origin" && site !== "none";
  if (foreign) {
    throw appError(
      403,
      "forbidden",
      "This request came from another site. Open the app from its own address, then try again.",
    );
  }
}

export function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function deskCookieKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("desk cookie").digest();
}

function access(store: StoreRow, via: DeskAccess["via"]): DeskAccess {
  return {
    storeId: store.id,
    sellerId: store.seller_id,
    slug: store.slug,
    isDemo: store.is_demo === 1,
    via,
  };
}
