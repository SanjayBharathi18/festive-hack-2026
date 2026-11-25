import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { CodePurpose } from "../../shared/verify.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";

export type StartResult =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; retryAfterMs: number };

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; triesLeft: number }
  | { ok: false; reason: "expired" | "used" | "tries_used" };

export type Codes = {
  start: (target: string, purpose: CodePurpose) => StartResult;
  check: (target: string, purpose: CodePurpose, code: string) => CheckResult;
};

type CodeRow = {
  id: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
};

export const codeRules = {
  ttlMs: 5 * 60_000,
  tries: 5,
  perTarget: 3,
  windowMs: 15 * 60_000,
};

const usedHash = "used";

export function createCodes({
  db,
  clock,
  secret,
  draw = () => randomInt(0, 1_000_000),
}: {
  db: Db;
  clock: Clock;
  secret: string;
  draw?: () => number;
}): Codes {
  const removeOld = db.prepare("DELETE FROM codes WHERE expires_at <= ?");
  const recent = db
    .prepare(
      "SELECT expires_at FROM codes WHERE target = ? AND expires_at > ? ORDER BY expires_at",
    )
    .pluck();
  const insert = db.prepare(
    "INSERT INTO codes (id, target, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
  );
  const latest = db.prepare(
    "SELECT id, code_hash, expires_at, attempts FROM codes WHERE target = ? AND purpose = ? ORDER BY expires_at DESC, rowid DESC LIMIT 1",
  );
  const countTry = db.prepare(
    "UPDATE codes SET attempts = attempts + 1 WHERE id = ?",
  );
  const markUsed = db.prepare("UPDATE codes SET code_hash = ? WHERE id = ?");
  const hash = (id: string, code: string) =>
    createHmac("sha256", secret).update(`code:${id}:${code}`).digest("hex");

  return {
    start: (target, purpose) => {
      const now = clock.now();
      const windowStart = now - codeRules.windowMs;
      removeOld.run(windowStart + codeRules.ttlMs);
      const expiries = recent.all(
        target,
        windowStart + codeRules.ttlMs,
      ) as number[];
      const oldest = expiries[0];
      if (expiries.length >= codeRules.perTarget && oldest !== undefined) {
        return {
          ok: false,
          retryAfterMs: oldest - codeRules.ttlMs + codeRules.windowMs - now,
        };
      }
      const id = randomUUID();
      const code = String(draw()).padStart(6, "0");
      const expiresAt = now + codeRules.ttlMs;
      insert.run(id, target, purpose, hash(id, code), expiresAt);
      return { ok: true, code, expiresAt };
    },
    check: (target, purpose, code) => {
      const row = latest.get(target, purpose) as CodeRow | undefined;
      if (row === undefined || row.expires_at <= clock.now()) {
        return { ok: false, reason: "expired" };
      }
      if (row.code_hash === usedHash) return { ok: false, reason: "used" };
      if (row.attempts >= codeRules.tries) {
        return { ok: false, reason: "tries_used" };
      }
      if (sameHash(hash(row.id, code), row.code_hash)) {
        markUsed.run(usedHash, row.id);
        return { ok: true };
      }
      countTry.run(row.id);
      return {
        ok: false,
        reason: "wrong",
        triesLeft: codeRules.tries - row.attempts - 1,
      };
    },
  };
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
