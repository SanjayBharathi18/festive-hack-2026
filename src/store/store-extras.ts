import type { StoreBulk } from "../../shared/bulk.ts";
import type { StoreCatering } from "../../shared/catering.ts";
import type { StorePage } from "../../shared/store.ts";
import { createApi } from "../api/api.ts";
import { createBulkView, type BulkSounds } from "../bulk/bulk-view.ts";
import {
  offerLimits,
  offerMinimum,
  offerPrice,
  otherWaysTag,
  styleWords,
} from "../catering/offer-words.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { fromHtml } from "../quotes/fragment.ts";
import type { Text } from "../text/text.ts";
import "./store-extras.css";
import html from "./store-extras.html?raw";

// Her bulk and catering sections on her store page, when she turned them
// on, each with its way to Contact seller. text: the words of the page, so
// that the page keeps the words that it set.
export function mountStoreExtras(
  root: HTMLElement,
  store: StorePage,
  sounds: BulkSounds,
  text: Text,
): void {
  if (store.bulk === null && store.catering === null) {
    root.hidden = true;
    return;
  }
  try {
    mount(root, store, sounds, text);
  } catch (error) {
    console.error("The bulk and catering sections did not open.", error);
  }
}

function mount(
  root: HTMLElement,
  page: StorePage,
  sounds: BulkSounds,
  text: Text,
): void {
  showOtherWays(page, text);
  const parts = fromHtml(html, text);
  const sections: HTMLElement[] = [];
  if (page.bulk !== null)
    sections.push(bulkSection(parts, page, page.bulk, text, sounds));
  if (page.catering !== null) {
    sections.push(cateringSection(parts, page, page.catering, text));
  }
  root.replaceChildren(...sections);
}

// A store with no food orders that takes catering or bulk requests says so
// in a neutral tag, in place of the kumkum "Not taking orders". The key goes
// on the tag too, so that a later pass of the words keeps it.
function showOtherWays(page: StorePage, text: Text): void {
  const key = otherWaysTag(
    page.store,
    page.bulk !== null,
    page.catering !== null,
  );
  const tag = document.querySelector<HTMLElement>("#store-closed");
  if (key === undefined || tag === null) return;
  tag.setAttribute("data-text", key);
  tag.textContent = text.t(key);
  tag.dataset.open = "other";
}

function bulkSection(
  parts: HTMLElement,
  page: StorePage,
  bulk: StoreBulk,
  text: Text,
  sounds: BulkSounds,
): HTMLElement {
  const section = find(parts, ".extras-bulk", HTMLElement);
  section.hidden = false;
  const scriptNames = new Map(
    page.sections.flatMap(({ items }) =>
      items.flatMap(({ id, name_script }) =>
        name_script === null ? [] : [[id, name_script] as const],
      ),
    ),
  );
  find(section, ".extras-bulk-line", HTMLElement).textContent = bulk.line ?? "";
  const view = createBulkView({
    api: createApi(),
    text,
    primary: !page.store.normal_orders_on || page.store.paused,
    sounds,
  });
  const card = view.storeCard(
    {
      store: {
        id: page.store.id,
        slug: page.store.slug,
        name: page.store.name,
        area: page.store.area,
        city: page.store.city,
        is_demo: page.store.is_demo,
      },
      line: null,
      items: bulk.items.map((item) => ({
        ...item,
        name_script: item.name_script ?? scriptNames.get(item.id) ?? null,
      })),
    },
    false,
  );
  find(section, ".extras-bulk-items", HTMLElement).append(
    find(card, ".bulk-items", HTMLTableElement),
  );
  find(section, ".extras-bulk-cart", HTMLElement).append(view.cartBody);
  return section;
}

function cateringSection(
  parts: HTMLElement,
  page: StorePage,
  catering: StoreCatering,
  text: Text,
): HTMLElement {
  const section = find(parts, ".extras-catering", HTMLElement);
  section.hidden = false;
  const template = find(parts, ".extras-package-template", HTMLTemplateElement);
  const booked = find(section, ".extras-booked", HTMLElement);
  booked.hidden = catering.booked.length === 0;
  booked.textContent = text.t("catering.store.booked", {
    days: catering.booked.map((day) => text.day(day, "short")).join(", "),
  });
  const slug = encodeURIComponent(page.store.slug);
  const lone = catering.packages.length === 1 && !page.store.normal_orders_on;
  find(section, ".extras-packages", HTMLElement).append(
    ...catering.packages.map((pkg, index) => {
      const item = cloneTemplate(template);
      const offer = { ...pkg, limits: pkg.categories };
      find(item, ".extras-package-name", HTMLElement).textContent = pkg.name;
      const price = find(item, ".extras-package-price", HTMLElement);
      price.textContent = offerPrice(pkg, text);
      price.classList.toggle("num", pkg.price !== null);
      find(item, ".extras-package-limits", HTMLElement).textContent =
        offerLimits(offer, text);
      find(item, ".extras-package-meta", HTMLElement).textContent = [
        offerMinimum(pkg, text),
        styleWords(pkg.service_styles, text),
      ].join(" · ");
      const plan = find(item, ".extras-package-plan", HTMLAnchorElement);
      plan.href = `/c/${slug}/${pkg.id}`;
      plan.className = lone && index === 0 ? "btn-primary" : "btn-plain";
      plan.setAttribute(
        "aria-label",
        text.t("catering.panel.plan_named", { name: pkg.name }),
      );
      return item;
    }),
  );
  return section;
}
