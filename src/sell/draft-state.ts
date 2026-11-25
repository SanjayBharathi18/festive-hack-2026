import { draftSchema, newDraft, type Draft } from "./draft.ts";

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

// new: nothing to keep yet; saved: kept in this browser; unsaved: this
// browser cannot keep it.
export type SaveStatus = "new" | "saved" | "unsaved";

export type DraftState = {
  readonly draft: Draft;
  readonly status: SaveStatus;
  update(change: (draft: Draft) => Draft): void;
};

export const draftKey = "sell.draft";

// The one copy of her draft. Each change goes to this browser at once; a
// browser that cannot keep it still works for this visit.
export function createDraftState({
  storage,
  newId = () => crypto.randomUUID(),
  onChange,
  onError = (error) => console.error("The draft was not saved.", error),
}: {
  storage: DraftStorage | undefined;
  newId?: () => string;
  onChange: (draft: Draft, status: SaveStatus) => void;
  onError?: (error: unknown) => void;
}): DraftState {
  const loaded = loadDraft(storage, onError);
  let draft = loaded ?? newDraft(newId());
  let status: SaveStatus =
    storage === undefined ? "unsaved" : loaded === undefined ? "new" : "saved";

  return {
    get draft() {
      return draft;
    },
    get status() {
      return status;
    },
    update(change) {
      const next = change(draft);
      if (next === draft) return;
      draft = next;
      status = saveDraft(storage, draft, onError) ? "saved" : "unsaved";
      onChange(draft, status);
    },
  };
}

export function loadDraft(
  storage: DraftStorage | undefined,
  onError: (error: unknown) => void = () => {},
): Draft | undefined {
  try {
    const text = storage?.getItem(draftKey);
    if (text === null || text === undefined) return undefined;
    const parsed = draftSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    onError(parsed.error);
  } catch (error) {
    onError(error);
  }
  return undefined;
}

function saveDraft(
  storage: DraftStorage | undefined,
  draft: Draft,
  onError: (error: unknown) => void,
): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(draftKey, JSON.stringify(draft));
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
