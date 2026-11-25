import { slugCheckSchema, slugSchema } from "../../shared/setup.ts";
import { isAbortError, type Api } from "../api/api.ts";

export type LinkState =
  | { kind: "empty" }
  | { kind: "invalid"; slug: string }
  | { kind: "checking"; slug: string }
  | { kind: "free"; slug: string }
  | { kind: "taken"; slug: string; suggestion: string | null }
  | { kind: "unknown"; slug: string };

export type LinkCheck = {
  readonly state: LinkState;
  check(slug: string, fresh?: boolean): void;
  stop(): void;
};

export const linkCheckDelayMs = 400;

// Asks the server whether her link is free while she types: after a pause,
// one request at a time, and each answer once. A failed check does not stop
// her, because publish checks the link again.
export function createLinkCheck({
  api,
  storeId,
  onState,
  delayMs = linkCheckDelayMs,
}: {
  api: Pick<Api, "get">;
  storeId: () => string;
  onState: (state: LinkState) => void;
  delayMs?: number;
}): LinkCheck {
  let state: LinkState = { kind: "empty" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const answers = new Map<string, LinkState>();

  const show = (next: LinkState) => {
    state = next;
    onState(next);
  };
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  };
  const ask = async (slug: string) => {
    timer = undefined;
    const current = new AbortController();
    controller = current;
    try {
      const answer = await api.get(
        `/api/sell/slugs/${slug}?store=${encodeURIComponent(storeId())}`,
        slugCheckSchema,
        { signal: current.signal },
      );
      const next: LinkState = answer.available
        ? { kind: "free", slug }
        : { kind: "taken", slug, suggestion: answer.suggestion };
      answers.set(slug, next);
      if (controller === current) show(next);
    } catch (error) {
      if (isAbortError(error) || current.signal.aborted) return;
      show({ kind: "unknown", slug });
    }
  };

  return {
    get state() {
      return state;
    },
    check(slug, fresh = false) {
      stop();
      if (slug === "") return show({ kind: "empty" });
      if (!slugSchema.safeParse(slug).success) {
        return show({ kind: "invalid", slug });
      }
      const known = fresh ? undefined : answers.get(slug);
      if (known !== undefined) return show(known);
      show({ kind: "checking", slug });
      timer = setTimeout(() => void ask(slug), delayMs);
    },
    stop,
  };
}
