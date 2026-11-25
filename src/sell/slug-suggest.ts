import {
  madeUpSlug,
  slugFromName,
  slugSuggestionSchema,
} from "../../shared/setup.ts";
import { isAbortError, type Api } from "../api/api.ts";

export type SlugSuggest = {
  suggest(name: string): void;
  stop(): void;
};

export const slugSuggestDelayMs = 600;

// The link that follows her store name. A name in English letters gives
// its link at once. Another name, such as दूसरी दुकान, asks the server after
// a pause for a link from its Latin form; with no answer, a made-up link.
// The link is never empty while the name has words.
export function createSlugSuggest({
  api,
  storeId,
  onSlug,
  delayMs = slugSuggestDelayMs,
  madeUp = madeUpSlug,
}: {
  api: Pick<Api, "get">;
  storeId: () => string;
  onSlug: (slug: string) => void;
  delayMs?: number;
  madeUp?: () => string;
}): SlugSuggest {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const answers = new Map<string, string>();

  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };
  const ask = async (name: string) => {
    timer = undefined;
    const current = new AbortController();
    controller = current;
    try {
      const answer = await api.get(
        `/api/sell/slug-suggestion?name=${encodeURIComponent(name)}&store=${encodeURIComponent(storeId())}`,
        slugSuggestionSchema,
        { signal: current.signal },
      );
      answers.set(name, answer.slug);
      if (controller === current) onSlug(answer.slug);
    } catch (error) {
      if (isAbortError(error) || current.signal.aborted) return;
      const slug = madeUp();
      answers.set(name, slug);
      onSlug(slug);
    }
  };

  return {
    suggest(name) {
      stop();
      const words = name.trim();
      const own = slugFromName(words);
      if (words === "" || own !== "") return onSlug(own);
      const known = answers.get(words);
      if (known !== undefined) return onSlug(known);
      timer = setTimeout(() => void ask(words), delayMs);
    },
    stop,
  };
}
