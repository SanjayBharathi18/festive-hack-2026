import {
  cateringSearchAnswerSchema,
  foodTypeSchema,
  type Caterer,
  type PackageKind,
} from "../../shared/catering.ts";
import { createApi, isAbortError } from "../api/api.ts";
import { catererQuery } from "../catering/caterer-query.ts";
import {
  offerLimits,
  offerMinimum,
  offerPrice,
  styleWords,
} from "../catering/offer-words.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { fromHtml } from "../quotes/fragment.ts";
import type { Text, TextKey } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import "./catering-panel.css";
import { showRating } from "./cook-card.ts";
import html from "./catering-panel.html?raw";

// The Catering tab: filters for the event, and the caterers whose packages
// fit them: the head of a cook card for each caterer, then a card for each
// package with a link to its plan builder. text: the words of the page.
// city: the city of the picker; its caterers only.
export function mountCateringPanel(
  root: HTMLElement,
  signal: AbortSignal,
  text: Text,
  city: string,
): void {
  void mount(root, signal, text, city).catch((error: unknown) => {
    if (!signal.aborted)
      console.error("The catering panel did not open.", error);
  });
}

async function mount(
  root: HTMLElement,
  signal: AbortSignal,
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
  const form = el(".catering-filters", HTMLFormElement);
  const list = el(".caterers", HTMLElement);
  const none = el(".catering-none", HTMLElement);
  const error = el(".catering-error", HTMLElement);
  const wait = createWait({
    control: list,
    line: el(".catering-wait", HTMLElement),
  });
  const template = (name: string) =>
    el(`.${name}-template`, HTMLTemplateElement);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const value = (name: string) => {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement ? field.value : "";
  };

  const search = async () => {
    error.hidden = true;
    const food = foodTypeSchema.safeParse(
      form.querySelector<HTMLInputElement>("[name=food]:checked")?.value,
    );
    const query = catererQuery({
      city,
      date: value("date"),
      guests: value("guests"),
      maxRupees: value("max_price"),
      food: food.success ? food.data : "",
    });
    try {
      const answer = await wait.run(
        (inner) =>
          api.get(`/api/catering/search${query}`, cateringSearchAnswerSchema, {
            signal: AbortSignal.any([signal, inner]),
          }),
        text.t("catering.panel.loading"),
        { restart: true },
      );
      const dateInput = form.elements.namedItem("date");
      if (dateInput instanceof HTMLInputElement) dateInput.min = answer.today;
      list.replaceChildren(
        ...answer.caterers.map((caterer) =>
          catererCard(caterer, template, text),
        ),
      );
      none.hidden = answer.caterers.length > 0;
      none.textContent = food.success
        ? text.t("catering.panel.none_food", {
            food: text.t(`catering.food.${food.data}`),
          })
        : text.t("catering.panel.none");
    } catch (problem) {
      if (isAbortError(problem) || signal.aborted) return;
      error.textContent = text.error(problem, "catering");
      error.hidden = false;
    }
  };

  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 300);
  };
  form.addEventListener("input", later, { signal });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void search();
  });
  signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  await search();
}

function catererCard(
  caterer: Caterer,
  template: (name: string) => HTMLTemplateElement,
  text: Text,
): HTMLElement {
  const card = cloneTemplate(template("caterer"));
  const slug = encodeURIComponent(caterer.store.slug);
  const name = find(card, ".caterer-name", HTMLAnchorElement);
  name.textContent = caterer.store.name;
  name.href = `/s/${slug}`;
  find(card, ".caterer-demo", HTMLElement).hidden = !caterer.store.is_demo;
  const kind = find(card, ".caterer-kind", HTMLElement);
  kind.textContent = [
    caterer.store.area,
    text.t(kindKey(caterer.packages.map(({ kind: each }) => each))),
  ]
    .filter(Boolean)
    .join(" · ");
  kind.title = kind.textContent;
  showRating(find(card, ".caterer-rating", HTMLElement), caterer.rating, text);
  find(card, ".caterer-packages", HTMLElement).append(
    ...caterer.packages.map((offer) => {
      const item = cloneTemplate(template("offer"));
      find(item, ".offer-name", HTMLElement).textContent = offer.name;
      const price = find(item, ".offer-price", HTMLElement);
      price.textContent = offerPrice(offer, text);
      price.classList.toggle("num", offer.price !== null);
      find(item, ".offer-limits", HTMLElement).textContent = offerLimits(
        offer,
        text,
      );
      find(item, ".offer-meta", HTMLElement).textContent = [
        offerMinimum(offer, text),
        styleWords(offer.service_styles, text),
      ].join(" · ");
      const plan = find(item, ".offer-plan", HTMLAnchorElement);
      plan.href = `/c/${slug}/${offer.id}`;
      plan.setAttribute(
        "aria-label",
        text.t("catering.panel.plan_named", { name: offer.name }),
      );
      return item;
    }),
  );
  return card;
}

// "Plate and buffet packages": the kinds of her packages that fit.
function kindKey(kinds: readonly PackageKind[]): TextKey {
  const plates = kinds.includes("plate");
  const buffets = kinds.includes("buffet");
  if (plates && buffets) return "catering.panel.kind.both";
  return plates ? "catering.panel.kind.plate" : "catering.panel.kind.buffet";
}
