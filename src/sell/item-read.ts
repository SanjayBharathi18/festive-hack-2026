import {
  itemReadAnswerSchema,
  partAnswerSchema,
  type ItemReadAnswer,
} from "../../shared/reading.ts";
import { isApiError, type Api } from "../api/api.ts";

export type ReadStep =
  { kind: "sending"; part: number; of: number } | { kind: "reading" };

// One Sarvam call can take 20 s, and a reading chains calls with retries, so
// the page waits longer than the server does.
export const partTimeoutMs = 90_000;
export const readTimeoutMs = 90_000;

type ReadOptions = {
  signal?: AbortSignal | undefined;
  onStep?: (step: ReadStep) => void;
};

// One item from her voice: each part goes up on its own, then one reading
// fills the item. Parts live 15 minutes on the server: an expired part goes
// up once more.
export async function readItemVoice(
  api: Pick<Api, "send">,
  parts: readonly Blob[],
  { signal, onStep = () => {} }: ReadOptions = {},
): Promise<ItemReadAnswer> {
  if (parts.length === 0)
    throw new Error("A voice note has at least one part.");
  const upload = async (): Promise<string[]> => {
    const ids: string[] = [];
    for (const [index, part] of parts.entries()) {
      onStep({ kind: "sending", part: index + 1, of: parts.length });
      const answer = await api.send(
        "POST",
        "/api/sell/read/parts",
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
      "/api/sell/items/read",
      { part_ids: ids },
      itemReadAnswerSchema,
      { signal, timeoutMs: readTimeoutMs },
    );
  };
  try {
    return await read(await upload());
  } catch (error) {
    if (!isApiError(error) || error.code !== "parts_expired") throw error;
    return read(await upload());
  }
}

// One item from the words that she typed or pasted.
export function readItemText(
  api: Pick<Api, "send">,
  text: string,
  { signal }: { signal?: AbortSignal | undefined } = {},
): Promise<ItemReadAnswer> {
  return api.send(
    "POST",
    "/api/sell/items/read",
    { text: text.trim() },
    itemReadAnswerSchema,
    { signal, timeoutMs: readTimeoutMs },
  );
}
