import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestClock } from "../test-app.ts";
import { createPartStore, joinParts, partTtlMs, type Part } from "./parts.ts";

const scope = { storeId: "store-1", kind: "desk" } as const;

function heard(
  transcript: string,
  seconds: number,
  language: Part["language"],
): Omit<Part, "id"> {
  return {
    ...scope,
    transcript,
    language,
    probability: 0.9,
    seconds,
    placeholder: false,
  };
}

test("a part is found by its id, for its store and kind only", () => {
  const parts = createPartStore(createTestClock());
  const part = parts.add(heard("ಎರಡು ಕೆಜಿ", 3, "kn-IN"));
  assert.match(part.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(parts.find([part.id], scope), [part]);
  assert.equal(
    parts.find([part.id], { ...scope, storeId: "store-2" }),
    undefined,
  );
  assert.equal(parts.find([part.id], { ...scope, kind: "cart" }), undefined);
  assert.equal(parts.find([part.id, "unknown"], scope), undefined);
});

test("a part expires after its TTL", () => {
  const clock = createTestClock();
  const parts = createPartStore(clock);
  const part = parts.add(heard("one", 1, "en-IN"));
  clock.advance(partTtlMs - 1);
  assert.ok(parts.find([part.id], scope));
  clock.advance(1);
  assert.equal(parts.find([part.id], scope), undefined);
});

test("the store keeps a limited number of parts and drops the oldest", () => {
  const parts = createPartStore(createTestClock(), { capacity: 2 });
  const first = parts.add(heard("one", 1, null));
  const second = parts.add(heard("two", 1, null));
  const third = parts.add(heard("three", 1, null));
  assert.equal(parts.find([first.id], scope), undefined);
  assert.ok(parts.find([second.id, third.id], scope));
});

test("the transcripts join in order, and the language is the language of the longest part", () => {
  const parts: Part[] = [
    { id: "a", ...heard("Hi aunty, Sunday ko 2 kg kaju katli,", 4, "hi-IN") },
    { id: "b", ...heard(" ", 0.5, null) },
    { id: "c", ...heard("Koramangala delivery.", 1.5, "en-IN") },
  ];
  assert.deepEqual(joinParts(parts), {
    transcript: "Hi aunty, Sunday ko 2 kg kaju katli, Koramangala delivery.",
    language: "hi-IN",
    placeholder: false,
  });
});

test("a longest part with no language gives way to the next longest", () => {
  assert.deepEqual(
    joinParts([
      { id: "a", ...heard("…", 9, null) },
      { id: "b", ...heard("ಚಕ್ಕುಲಿ", 2, "kn-IN") },
      { id: "c", ...heard("ok", 1, "en-IN") },
    ]).language,
    "kn-IN",
  );
  assert.deepEqual(joinParts([]), {
    transcript: "",
    language: null,
    placeholder: false,
  });
});

test("parts of the same length are decided by the longer transcript", () => {
  assert.equal(
    joinParts([
      { id: "a", ...heard("ok", 2, "en-IN") },
      { id: "b", ...heard("ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ", 2, "kn-IN") },
    ]).language,
    "kn-IN",
  );
});
