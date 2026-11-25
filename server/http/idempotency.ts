import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import type { AppEnv } from "./context.ts";
import { errorResponse } from "./errors.ts";
import { readBody } from "./input.ts";

type StoredResponse = {
  status: ContentfulStatusCode;
  type: string | null;
  body: string;
  cookies?: string[];
  location?: string | null;
};

type StoredKey = { request_hash: string; response: string | null };

export const idempotencyTtlMs = 24 * 60 * 60 * 1000;
export const idempotentBodyLimitBytes = 2 * 1024 * 1024;

const keyPattern = /^[\x21-\x7e]{8,255}$/;

export function createIdempotency({
  db,
  clock,
}: {
  db: Db;
  clock: Clock;
}): MiddlewareHandler<AppEnv> {
  db.prepare("DELETE FROM idempotency_keys WHERE response IS NULL").run();
  const removeExpired = db.prepare(
    "DELETE FROM idempotency_keys WHERE created_at <= ?",
  );
  const claim = db.prepare(
    "INSERT INTO idempotency_keys (key, scope, route, request_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  );
  const find = db.prepare(
    "SELECT request_hash, response FROM idempotency_keys WHERE key = ? AND scope = ? AND route = ?",
  );
  const save = db.prepare(
    "UPDATE idempotency_keys SET response = ? WHERE key = ? AND scope = ? AND route = ?",
  );
  const release = db.prepare(
    "DELETE FROM idempotency_keys WHERE key = ? AND scope = ? AND route = ?",
  );

  return async (c, next) => {
    const key = c.req.header("Idempotency-Key");
    if (key === undefined || !keyPattern.test(key)) {
      return errorResponse(
        c,
        400,
        "idempotency_key_missing",
        "Send an Idempotency-Key header of 8 to 255 characters: a new random value for each new request, and the same value when you retry it.",
      );
    }
    const id = [
      key,
      c.get("idempotencyScope") ?? "",
      `${c.req.method} ${c.req.path}`,
    ] as const;
    const original = c.req.raw;
    const body = await readBody(original, idempotentBodyLimitBytes);
    if (original.body !== null) {
      c.req.raw = new Request(original, { body, signal: original.signal });
    }
    const hash = requestHash(new URL(c.req.url).search, body);
    const now = clock.now();
    removeExpired.run(now - idempotencyTtlMs);
    if (claim.run(...id, hash, now).changes === 0) {
      const stored = find.get(...id) as StoredKey;
      if (stored.request_hash !== hash) {
        return errorResponse(
          c,
          422,
          "idempotency_key_reused",
          "This Idempotency-Key was used for a different request. Make a new key for each new request.",
        );
      }
      if (stored.response === null) {
        return errorResponse(
          c,
          409,
          "idempotency_key_in_use",
          "The first request with this Idempotency-Key is still running. Wait for its answer.",
        );
      }
      const replay = JSON.parse(stored.response) as StoredResponse;
      c.header("Idempotent-Replayed", "true");
      if (replay.type !== null) c.header("Content-Type", replay.type);
      if (replay.location) c.header("Location", replay.location);
      for (const cookie of replay.cookies ?? []) {
        c.header("Set-Cookie", cookie, { append: true });
      }
      return c.body(replay.body, replay.status);
    }
    let saved = false;
    try {
      await next();
      if (c.res.ok) {
        const response: StoredResponse = {
          status: c.res.status as ContentfulStatusCode,
          type: c.res.headers.get("Content-Type"),
          body: await c.res.clone().text(),
          cookies: c.res.headers.getSetCookie(),
          location: c.res.headers.get("Location"),
        };
        save.run(JSON.stringify(response), ...id);
        saved = true;
      }
    } finally {
      if (!saved) release.run(...id);
    }
  };
}

function requestHash(search: string, body: Uint8Array): string {
  return createHash("sha256")
    .update(search)
    .update("\n")
    .update(body)
    .digest("hex");
}
