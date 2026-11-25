import { randomUUID } from "node:crypto";
import type { SarvamLanguage } from "../../shared/languages.ts";
import type { Clock } from "../clock.ts";

export type ReadKind = "desk" | "cart" | "item";

export type Part = {
  id: string;
  storeId: string;
  kind: ReadKind;
  transcript: string;
  language: SarvamLanguage | null;
  probability: number | null;
  seconds: number;
  placeholder: boolean;
};

export type Heard = {
  transcript: string;
  language: SarvamLanguage | null;
  placeholder: boolean;
};

export type PartStore = {
  add: (part: Omit<Part, "id">) => Part;
  find: (
    ids: readonly string[],
    scope: Pick<Part, "storeId" | "kind">,
  ) => Part[] | undefined;
};

export const partTtlMs = 15 * 60_000;
export const maxStoredParts = 2_000;

export function createPartStore(
  clock: Clock,
  { ttlMs = partTtlMs, capacity = maxStoredParts } = {},
): PartStore {
  const parts = new Map<string, Part & { expiresAt: number }>();
  const removeExpired = (now: number) => {
    for (const [id, part] of parts) {
      if (part.expiresAt > now) break;
      parts.delete(id);
    }
  };
  return {
    add: (part) => {
      const now = clock.now();
      removeExpired(now);
      for (const id of parts.keys()) {
        if (parts.size < capacity) break;
        parts.delete(id);
      }
      const stored = { ...part, id: randomUUID(), expiresAt: now + ttlMs };
      parts.set(stored.id, stored);
      return withoutExpiry(stored);
    },
    find: (ids, { storeId, kind }) => {
      const now = clock.now();
      const found: Part[] = [];
      for (const id of ids) {
        const part = parts.get(id);
        if (
          part === undefined ||
          part.expiresAt <= now ||
          part.storeId !== storeId ||
          part.kind !== kind
        ) {
          return undefined;
        }
        found.push(withoutExpiry(part));
      }
      return found;
    },
  };
}

export function joinParts(parts: readonly Part[]): Heard {
  const transcript = parts
    .map((part) => part.transcript.trim())
    .filter((text) => text !== "")
    .join(" ");
  const longest = parts
    .filter((part) => part.language !== null)
    .reduce<Part | undefined>(
      (best, part) => (best === undefined || longer(part, best) ? part : best),
      undefined,
    );
  return {
    transcript,
    language: longest?.language ?? null,
    placeholder: parts.some((part) => part.placeholder),
  };
}

function longer(a: Part, b: Part): boolean {
  return (
    a.seconds > b.seconds ||
    (a.seconds === b.seconds && a.transcript.length > b.transcript.length)
  );
}

function withoutExpiry({
  expiresAt: _,
  ...part
}: Part & { expiresAt: number }): Part {
  return part;
}
