import {
  cartReadAnswerSchema,
  partAnswerSchema,
  type CartReadAnswer,
} from "../../shared/reading.ts";
import { isApiError, type Api } from "../api/api.ts";
import type { Via } from "../cart/links.ts";

export type ReadStep =
  { kind: "sending"; part: number; of: number } | { kind: "reading" };

// One Sarvam call can take 20 s, and a reading chains calls with retries, so
// the page waits longer than the server does.
export const partTimeoutMs = 90_000;
export const readTimeoutMs = 90_000;

// Each part goes up on its own, then one reading turns the parts into a cart.
// Parts live 15 minutes on the server: an expired part goes up once more.
export async function readVoiceCart(
  { api, slug, via }: { api: Pick<Api, "send">; slug: string; via?: Via },
  parts: readonly Blob[],
  {
    signal,
    onStep = () => {},
  }: { signal?: AbortSignal; onStep?: (step: ReadStep) => void } = {},
): Promise<CartReadAnswer> {
  const upload = async (): Promise<string[]> => {
    const ids: string[] = [];
    for (const [index, part] of parts.entries()) {
      onStep({ kind: "sending", part: index + 1, of: parts.length });
      const answer = await api.send(
        "POST",
        `/api/cart/read/parts?store=${encodeURIComponent(slug)}`,
        part,
        partAnswerSchema,
        { signal, timeoutMs: partTimeoutMs },
      );
      ids.push(answer.part_id);
    }
    return ids;
  };
  const read = (ids: string[]) => {
    onStep({ kind: "reading" });
    return api.send(
      "POST",
      "/api/cart/read",
      { store: slug, part_ids: ids, ...(via === undefined ? {} : { via }) },
      cartReadAnswerSchema,
      { signal, timeoutMs: readTimeoutMs },
    );
  };
  if (parts.length === 0)
    throw new Error("A voice note has at least one part.");
  try {
    return await read(await upload());
  } catch (error) {
    if (!isApiError(error) || error.code !== "parts_expired") throw error;
    return read(await upload());
  }
}
