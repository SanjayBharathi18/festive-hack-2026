import { bulkStoresSchema } from "../../shared/bulk.ts";
import { createApi } from "../api/api.ts";
import { searchBulk } from "../bulk/bulk-cart.ts";
import { createBulkView, type BulkSounds } from "../bulk/bulk-view.ts";
import { find } from "../dom/dom.ts";
import { fromHtml } from "../quotes/fragment.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import "./bulk-panel.css";
import html from "./bulk-panel.html?raw";

// The Bulk and corporate tab: the stores with a bulk section and their bulk
// items, the bulk cart with Contact seller, and the request board. text: the
// words of the page. city: the city of the picker; its stores only.
export function mountBulkPanel(
  root: HTMLElement,
  signal: AbortSignal,
  sounds: BulkSounds,
  text: Text,
  city: string,
): void {
  void mount(root, signal, sounds, text, city).catch((error: unknown) => {
    if (!signal.aborted) console.error("The bulk panel did not open.", error);
  });
}

async function mount(
  root: HTMLElement,
  signal: AbortSignal,
  sounds: BulkSounds,
  text: Text,
  city: string,
): Promise<void> {
  const api = createApi();
  const panel = fromHtml(html, text);
  root.replaceChildren(panel);
  const el = <T extends Element>(
    selector: string,
    type: abstract new () => T,
  ) => find(panel, selector, type);
  const view = createBulkView({ api, text, primary: true, sounds });
  el(".bulk-cart", HTMLElement).append(view.cartBody);
  const stores = el(".bulk-stores", HTMLElement);
  const none = el(".bulk-none", HTMLElement);
  const search = el(".bulk-search input", HTMLInputElement);
  const error = el(".bulk-error", HTMLElement);
  const wait = createWait({
    control: stores,
    line: el(".bulk-wait", HTMLElement),
  });

  try {
    const answer = await wait.run(
      (inner) =>
        api.get(
          `/api/bulk/stores?${new URLSearchParams({ lang: text.language, city })}`,
          bulkStoresSchema,
          { signal: AbortSignal.any([signal, inner]) },
        ),
      text.t("bulk.panel.loading"),
    );
    const cards = new Map(
      answer.stores.map((entry) => [
        entry.store.id,
        view.storeCard(entry, true),
      ]),
    );
    const show = () => {
      const found = searchBulk(answer.stores, search.value);
      const items = new Set(
        found.flatMap(({ items: list }) => list.map(({ id }) => id)),
      );
      stores.replaceChildren(
        ...found.flatMap(({ store }) => {
          const card = cards.get(store.id);
          if (card === undefined) return [];
          for (const row of card.querySelectorAll<HTMLElement>(".bulk-item")) {
            row.hidden = !items.has(row.dataset.item ?? "");
          }
          return [card];
        }),
      );
      none.hidden = found.length > 0;
    };
    search.addEventListener("input", show, { signal });
    show();
    const example = el(".bulk-example", HTMLAnchorElement);
    if (answer.example_post !== null) {
      example.href = `/board-posts/${encodeURIComponent(answer.example_post)}`;
      example.hidden = false;
    }
  } catch (problem) {
    if (signal.aborted) return;
    error.textContent = text.error(problem, "bulk");
    error.hidden = false;
  }
}
