import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import { createTestClock } from "../test-app.ts";
import {
  createTranslationCache,
  failureRetryMs,
  translationHash,
  type TranslationKey,
} from "./translation-cache.ts";

const key: TranslationKey = {
  kind: "translate",
  model: "mayura:v1",
  source: "auto",
  target: "kn-IN",
  text: "कम मीठा",
};

function setup() {
  const clock = createTestClock();
  const db = openDatabase(":memory:");
  return { cache: createTranslationCache(db, clock), clock, db };
}

test("each part of the key changes the hash", () => {
  const hashes = new Set(
    [
      key,
      { ...key, kind: "transliterate" as const },
      { ...key, model: "sarvam-translate:v1" },
      { ...key, source: "hi-IN" },
      { ...key, target: "ta-IN" },
      { ...key, text: "कम नमक" },
    ].map(translationHash),
  );
  assert.equal(hashes.size, 6);
  assert.match(translationHash(key), /^[0-9a-f]{64}$/);
});

test("fill saves an answer, and get finds it", async () => {
  const { cache, db } = setup();
  assert.equal(cache.get(key), undefined);
  assert.equal(
    await cache.fill(key, async () => ({ text: "ಕಡಿಮೆ ಸಿಹಿ", save: true })),
    "ಕಡಿಮೆ ಸಿಹಿ",
  );
  assert.equal(cache.get(key), "ಕಡಿಮೆ ಸಿಹಿ");
  assert.deepEqual(
    db
      .prepare("SELECT kind, model, source, target, text FROM translations")
      .get(),
    {
      kind: "translate",
      model: "mayura:v1",
      source: "auto",
      target: "kn-IN",
      text: "ಕಡಿಮೆ ಸಿಹಿ",
    },
  );
  let calls = 0;
  await cache.fill(key, async () => {
    calls += 1;
    return null;
  });
  assert.equal(calls, 0);
});

test("an answer with save false is not stored", async () => {
  const { cache } = setup();
  await cache.fill(key, async () => ({ text: "placeholder", save: false }));
  assert.equal(cache.get(key), undefined);
});

test("concurrent fills of one key make one call", async () => {
  const { cache } = setup();
  let calls = 0;
  const call = async () => {
    calls += 1;
    return { text: "ಕಡಿಮೆ ಸಿಹಿ", save: true };
  };
  const answers = await Promise.all([
    cache.fill(key, call),
    cache.fill(key, call),
  ]);
  assert.deepEqual(answers, ["ಕಡಿಮೆ ಸಿಹಿ", "ಕಡಿಮೆ ಸಿಹಿ"]);
  assert.equal(calls, 1);
});

test("a failed or thrown call waits before the next try", async () => {
  const { cache, clock } = setup();
  let calls = 0;
  const fail = async () => {
    calls += 1;
    if (calls === 2) throw new Error("network");
    return null;
  };
  assert.equal(await cache.fill(key, fail), null);
  assert.equal(await cache.fill(key, fail), null);
  assert.equal(calls, 1);
  clock.advance(failureRetryMs);
  assert.equal(await cache.fill(key, fail), null);
  assert.equal(calls, 2);
  clock.advance(failureRetryMs - 1);
  await cache.fill(key, fail);
  assert.equal(calls, 2);
});
