import { createHash } from "node:crypto";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";

export type TranslationKind = "translate" | "transliterate";

export type TranslationKey = {
  kind: TranslationKind;
  model: string;
  source: string;
  target: string;
  text: string;
};

export type Answer = { text: string; save: boolean } | null;

export type TranslationCache = ReturnType<typeof createTranslationCache>;

export const failureRetryMs = 5 * 60_000;

export function createTranslationCache(db: Db, clock: Clock) {
  const select = db
    .prepare("SELECT text FROM translations WHERE hash = ?")
    .pluck();
  const insert = db.prepare(
    `INSERT INTO translations (hash, kind, model, source, target, text, created_at)
    VALUES (@hash, @kind, @model, @source, @target, @text, @created_at)
    ON CONFLICT (hash) DO UPDATE SET text = excluded.text,
      created_at = excluded.created_at`,
  );
  const pending = new Map<string, Promise<string | null>>();
  const failedAt = new Map<string, number>();

  const get = (key: TranslationKey): string | undefined =>
    select.get(translationHash(key)) as string | undefined;

  return {
    get,
    // One call for each key at a time. A failed key waits failureRetryMs
    // before its next call, so a broken API is not called on each page load.
    fill: (
      key: TranslationKey,
      call: () => Promise<Answer>,
    ): Promise<string | null> => {
      const hash = translationHash(key);
      const cached = get(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const running = pending.get(hash);
      if (running !== undefined) return running;
      const failed = failedAt.get(hash);
      if (failed !== undefined && clock.now() - failed < failureRetryMs) {
        return Promise.resolve(null);
      }
      const work = call()
        .catch((): Answer => null)
        .then((answer) => {
          if (answer === null) {
            failedAt.set(hash, clock.now());
            return null;
          }
          failedAt.delete(hash);
          if (answer.save) {
            insert.run({
              ...key,
              hash,
              text: answer.text,
              created_at: clock.now(),
            });
          }
          return answer.text;
        })
        .finally(() => pending.delete(hash));
      pending.set(hash, work);
      return work;
    },
  };
}

export function translationHash({
  kind,
  model,
  source,
  target,
  text,
}: TranslationKey): string {
  return createHash("sha256")
    .update(JSON.stringify([kind, model, source, target, text]))
    .digest("hex");
}
