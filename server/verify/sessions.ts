import { createHmac, randomBytes } from "node:crypto";
import type { CodePurpose } from "../../shared/verify.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";

export type Session = { subject: string; expiresAt: number };

export type Sessions = {
  open: (purpose: CodePurpose, subject: string) => Session & { token: string };
  find: (purpose: CodePurpose, token: string) => Session | undefined;
  close: (purpose: CodePurpose, token: string) => boolean;
};

const minute = 60_000;

export const sessionRules = {
  desk: { kind: "seller", ttlMs: 90 * 24 * 60 * minute },
  order: { kind: "buyer", ttlMs: 15 * minute },
  // A publish code signs her in with the desk session; this entry only keeps
  // the table complete.
  publish: { kind: "seller", ttlMs: 90 * 24 * 60 * minute },
  // A work email code gives a proof for one board post (server/bulk/).
  work_email: { kind: "buyer", ttlMs: 15 * minute },
} as const satisfies Record<
  CodePurpose,
  { kind: "seller" | "buyer"; ttlMs: number }
>;

export function createSessions({
  db,
  clock,
  secret,
}: {
  db: Db;
  clock: Clock;
  secret: string;
}): Sessions {
  const removeExpired = db.prepare(
    "DELETE FROM sessions WHERE expires_at <= ?",
  );
  const insert = db.prepare(
    "INSERT INTO sessions (id, kind, subject, expires_at) VALUES (?, ?, ?, ?)",
  );
  const select = db.prepare(
    "SELECT subject, expires_at FROM sessions WHERE id = ? AND kind = ? AND expires_at > ?",
  );
  const remove = db.prepare(
    "DELETE FROM sessions WHERE id = ? AND kind = ? AND expires_at > ?",
  );
  const idFor = (purpose: CodePurpose, token: string) =>
    createHmac("sha256", secret)
      .update(`session:${purpose}:${token}`)
      .digest("hex");

  return {
    open: (purpose, subject) => {
      const now = clock.now();
      removeExpired.run(now);
      const token = randomBytes(32).toString("base64url");
      const expiresAt = now + sessionRules[purpose].ttlMs;
      insert.run(
        idFor(purpose, token),
        sessionRules[purpose].kind,
        subject,
        expiresAt,
      );
      return { token, subject, expiresAt };
    },
    find: (purpose, token) => {
      const row = select.get(
        idFor(purpose, token),
        sessionRules[purpose].kind,
        clock.now(),
      ) as { subject: string; expires_at: number } | undefined;
      return row && { subject: row.subject, expiresAt: row.expires_at };
    },
    close: (purpose, token) =>
      remove.run(idFor(purpose, token), sessionRules[purpose].kind, clock.now())
        .changes === 1,
  };
}
