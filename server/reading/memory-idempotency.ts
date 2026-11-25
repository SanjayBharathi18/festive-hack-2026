import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Clock } from "../clock.ts";
import type { AppEnv } from "../http/context.ts";
import { appError } from "../http/errors.ts";

export type Caller<E extends AppEnv> = (
  c: Context<E>,
  body: Uint8Array,
) => string;

type Stored = {
  status: ContentfulStatusCode;
  type: string | null;
  body: string;
};

type Entry = { bodyHash: string; expiresAt: number; response?: Stored };

export const maxStoredKeys = 2_000;

const keyPattern = /^[\x21-\x7e]{8,255}$/;

export function createMemoryIdempotency(
  clock: Clock,
  { ttlMs, capacity = maxStoredKeys }: { ttlMs: number; capacity?: number },
) {
  const entries = new Map<string, Entry>();
  const removeExpired = (now: number) => {
    for (const [id, entry] of entries) {
      if (entry.expiresAt > now) break;
      entries.delete(id);
    }
  };
  return <E extends AppEnv>(caller: Caller<E>): MiddlewareHandler<E> =>
    async (c, next) => {
      const key = c.req.header("Idempotency-Key");
      if (key === undefined || !keyPattern.test(key)) {
        throw appError(
          400,
          "idempotency_key_missing",
          "Send an Idempotency-Key header of 8 to 255 characters: a new random value for each new request, and the same value when you retry it.",
        );
      }
      let body: Uint8Array;
      try {
        body = new Uint8Array(await c.req.raw.clone().arrayBuffer());
      } catch (error) {
        if (c.req.raw.signal.aborted)
          return new Response(null, { status: 499 });
        throw error;
      }
      const now = clock.now();
      removeExpired(now);
      const id = JSON.stringify([
        c.req.method,
        c.req.path,
        caller(c, body),
        key,
      ]);
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const entry = entries.get(id);
      if (entry !== undefined) {
        if (entry.bodyHash !== bodyHash) {
          throw appError(
            422,
            "idempotency_key_reused",
            "This Idempotency-Key came before with a different request. Send a new key for a new request.",
          );
        }
        if (entry.response === undefined) {
          throw appError(
            409,
            "idempotency_key_in_use",
            "The first request with this Idempotency-Key is still running. Wait for its answer.",
          );
        }
        c.header("Idempotent-Replayed", "true");
        if (entry.response.type !== null) {
          c.header("Content-Type", entry.response.type);
        }
        return c.body(entry.response.body, entry.response.status);
      }
      for (const oldest of entries.keys()) {
        if (entries.size < capacity) break;
        entries.delete(oldest);
      }
      const claimed: Entry = { bodyHash, expiresAt: now + ttlMs };
      entries.set(id, claimed);
      await next();
      if (!c.res.ok) {
        if (entries.get(id) === claimed) entries.delete(id);
        return;
      }
      claimed.response = {
        status: c.res.status as ContentfulStatusCode,
        type: c.res.headers.get("Content-Type"),
        body: await c.res.clone().text(),
      };
    };
}
