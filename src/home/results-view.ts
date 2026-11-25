import type { SearchAnswer } from "../../shared/search.ts";
import { buyerHref } from "../cart/links.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { createCookCards } from "./cook-card.ts";

export type ResultsView = {
  show(answer: SearchAnswer): void;
  problem(words: string): void;
};

// The cooks of one search as cook cards, with the title, the count and the
// notes of the search above them.
export function createResultsView(root: ParentNode, text: Text): ResultsView {
  const el = (id: string) => find(root, id, HTMLElement);
  const template = (id: string) => find(root, id, HTMLTemplateElement);
  const plural = new Intl.PluralRules(`${text.language}-IN`);

  // A marketplace result keeps the buyer's language, after via=market.
  const storeHref = (slug: string) => {
    const search = new URLSearchParams(location.search);
    search.set("via", "market");
    return buyerHref(`/s/${slug}`, `?${search}`);
  };
  const cards = createCookCards(
    { card: template("#store-template"), dish: template("#dish-template") },
    text,
    storeHref,
  );

  return {
    show(answer) {
      el("#search-problem").hidden = true;
      el("#results-title").textContent =
        answer.query !== ""
          ? text.t("search.results.for", { query: answer.query })
          : text.t(
              answer.located ? "search.results.near" : "search.results.city",
            );
      const count = answer.stores.length;
      el("#results-count").textContent = text.t(
        plural.select(count) === "one"
          ? "search.results.count_one"
          : "search.results.count_other",
        { count },
      );
      el("#results-latin").hidden = answer.latin === null;
      el("#results-latin-words").textContent =
        answer.latin === null
          ? ""
          : text.t("search.results.latin", { latin: answer.latin });
      el("#results-recorded").hidden = !answer.recorded;
      const note = el("#results-note");
      note.hidden = answer.need_by === null;
      note.textContent =
        answer.need_by === null
          ? ""
          : text.t(
              answer.need_by_met
                ? "search.results.need_by"
                : "search.results.need_by_none",
              { day: text.day(answer.need_by, "long") },
            );
      el("#results-list").replaceChildren(
        ...answer.stores.map((store) => cards.render(store, answer.today)),
      );
      const none = el("#results-none");
      none.hidden = count > 0;
      none.textContent =
        answer.query !== ""
          ? text.t("search.results.none_for", { query: answer.query })
          : text.t("search.results.none");
    },
    problem(words) {
      el("#search-error").textContent = words;
      el("#search-problem").hidden = words === "";
    },
  };
}
