import { istDay } from "../../shared/day.ts";
import { deskQuotesSchema, type DeskQuote } from "../../shared/quotes.ts";
import type { Api } from "../api/api.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { companyOf, placeOf, quoteCard } from "./quote-card.ts";
import {
  clone,
  fillFacts,
  fillLines,
  type RequestTemplates,
} from "./request-parts.ts";
import { fillTranslated } from "./translated-view.ts";

// The Quote requests tab: each bulk or catering request, newest first, in
// her language with the originals one switch away, and a link that opens
// WhatsApp to the buyer. Cards are kept by id, so a refresh keeps a switch
// where she left it; the old list stays until the new one arrives.
export function createQuotesView({
  root,
  api,
  text,
  templates,
  onNew,
}: {
  root: HTMLElement;
  api: Pick<Api, "get">;
  text: Text;
  templates: RequestTemplates & { quote: HTMLTemplateElement };
  // A request that came since the last load.
  onNew: () => void;
}): { load(): Promise<void> } {
  const list = part(root, "#quotes-list");
  const empty = part(root, "#quotes-empty");
  const problem = part(root, "#quotes-problem");
  const wait = createWait({
    control: root,
    line: root.querySelector("#quotes-wait"),
  });
  const cards = new Map<string, HTMLElement>();
  let loaded = false;

  const render = (quotes: readonly DeskQuote[]) => {
    empty.hidden = quotes.length > 0;
    const items = quotes.map((quote) => {
      let item = cards.get(quote.id);
      if (item === undefined) {
        item = clone(templates.quote);
        cards.set(quote.id, item);
      }
      fillQuote(item, quote, text, templates);
      return item;
    });
    const ids = new Set(quotes.map((quote) => quote.id));
    for (const id of cards.keys()) if (!ids.has(id)) cards.delete(id);
    list.replaceChildren(...items);
  };

  const load = async () => {
    try {
      const answer = await wait.run(
        (signal) => api.get("/api/desk/quotes", deskQuotesSchema, { signal }),
        text.t("desk.quotes.opening"),
        { restart: true },
      );
      problem.hidden = true;
      const fresh =
        loaded && answer.quotes.some((quote) => !cards.has(quote.id));
      loaded = true;
      render(answer.quotes);
      if (fresh) onNew();
    } catch (error) {
      const words = text.error(error, "desk");
      if (words === "" || (loaded && list.children.length > 0)) return;
      part(problem, ".error").textContent = words;
      problem.hidden = false;
    }
  };
  part(problem, "button").addEventListener("click", () => void load());
  return { load };
}

function fillQuote(
  item: HTMLElement,
  quote: DeskQuote,
  text: Text,
  templates: RequestTemplates,
): void {
  const card = quoteCard(quote, text);
  const article = part(item, "article");
  const title = part(item, ".request-title");
  title.id = `quote-${quote.id}`;
  article.setAttribute("aria-labelledby", title.id);
  title.textContent = card.title;
  part(item, ".request-from").textContent = quote.buyer.name;
  part(item, ".request-when").textContent = text.t("desk.quotes.received", {
    day: text.day(istDay(quote.created_at), "short"),
  });
  fillLines(part(item, ".request-lines tbody"), card.rows, templates.line);
  const company = part(item, ".request-company");
  company.hidden = companyOf(quote) === null;
  const place = part(item, ".request-place");
  place.hidden = placeOf(quote) === null;
  part(place, "dt").textContent = card.placeLabel;
  fillFacts(part(item, ".request-facts"), card.facts, templates.fact, [place]);
  const note = part(item, ".request-note");
  note.hidden = quote.request.note === null;
  fillTranslated(
    article,
    [
      {
        element: company,
        original: companyOf(quote),
        translation: quote.company_translation,
      },
      {
        element: part(place, "dd"),
        original: placeOf(quote),
        translation: quote.place_translation,
      },
      {
        element: part(note, ".request-note-text"),
        original: quote.request.note,
        translation: quote.note_translation,
      },
    ],
    text,
  );

  const estimate = part(item, ".request-estimate");
  estimate.hidden = card.estimate === undefined;
  part(estimate, ".num").textContent = card.estimate ?? "";
  part<HTMLAnchorElement>(item, ".request-reply").href = card.reply;
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`A quote request has no ${selector}.`);
  return found;
}
