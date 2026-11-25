import { showCityLock } from "../app-bar/city-lock.ts";
import { brandHref } from "../cart/links.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";

export type AppBarStore = {
  name: string;
  slug: string;
  is_demo: boolean;
  city?: string | null;
};

// The app bar of a page of one store: the store under the wordmark, the Demo
// badge on a demo store, and the store's own city, locked.
export function showAppBar(
  root: ParentNode,
  store: AppBarStore,
  search: string,
  text: Pick<Text, "t" | "language">,
): void {
  find(root, "#store-name", HTMLElement).textContent = store.name;
  find(root, "#demo-badge", HTMLElement).hidden = !store.is_demo;
  showCityLock(root, store.city, text);
  find(root, "a.brand", HTMLAnchorElement).href = brandHref(store.slug, search);
}
