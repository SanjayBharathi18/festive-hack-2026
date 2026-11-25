import assert from "node:assert/strict";
import { test } from "node:test";
import { goTo } from "./draft.ts";
import {
  createDraftState,
  draftKey,
  loadDraft,
  type DraftStorage,
} from "./draft-state.ts";
import { readyDraft, storeId } from "./test-draft.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  } satisfies DraftStorage & { items: Map<string, string> };
}

test("a first visit makes a new draft with a new store id, and says nothing is saved yet", () => {
  const state = createDraftState({
    storage: memoryStorage(),
    newId: () => storeId,
    onChange: () => {},
  });
  assert.equal(state.draft.store_id, storeId);
  assert.equal(state.draft.step, "language");
  assert.equal(state.status, "new", "no Draft saved before any input");
  const none = createDraftState({
    storage: undefined,
    newId: () => storeId,
    onChange: () => {},
  });
  assert.equal(none.status, "unsaved");
});

test("each change is saved at once and told to the page", () => {
  const storage = memoryStorage();
  const seen: string[] = [];
  const state = createDraftState({
    storage,
    newId: () => storeId,
    onChange: (_draft, status) => seen.push(status),
  });
  state.update((draft) => ({ ...draft, language: "hi" }));
  state.update((draft) => draft);
  assert.deepEqual(seen, ["saved"]);
  assert.equal(loadDraft(storage)?.language, "hi");
});

test("the saved draft comes back on the next visit", () => {
  const storage = memoryStorage({
    [draftKey]: JSON.stringify(goTo(readyDraft(), "preview")),
  });
  const state = createDraftState({
    storage,
    newId: () => "unused",
    onChange: () => {},
  });
  assert.equal(state.draft.name, "Shobha's Kitchen");
  assert.equal(state.status, "saved");
});

test("a broken draft gives a new one, and a full storage keeps the page working", () => {
  const errors: unknown[] = [];
  const broken = memoryStorage({ [draftKey]: "{not json" });
  const state = createDraftState({
    storage: broken,
    newId: () => storeId,
    onChange: () => {},
    onError: (error) => errors.push(error),
  });
  assert.equal(state.draft.language, null);
  assert.equal(errors.length, 1);
  const full: DraftStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  const saved: string[] = [];
  const kept = createDraftState({
    storage: full,
    newId: () => storeId,
    onChange: (_draft, status) => saved.push(status),
    onError: () => {},
  });
  kept.update((draft) => ({ ...draft, name: "Ghar" }));
  assert.equal(kept.draft.name, "Ghar");
  assert.deepEqual(saved, ["unsaved"]);
  assert.equal(kept.status, "unsaved");
});
