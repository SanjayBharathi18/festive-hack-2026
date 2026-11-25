import type {
  PublicStore,
  StoreDays,
  StoreRating,
} from "../../shared/store.ts";
import { showAppBar } from "../buyer/app-bar.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { dayNote } from "./day-choice.ts";

// The facts a buyer needs before she orders: whether the store takes orders,
// its stars, area, pickup or delivery, the next day with space, the last day,
// and the FSSAI number when the seller gave one. The app checks only its 14
// digits, so the number shows as given by the seller, never as verified.
export function showStoreHead(
  root: ParentNode,
  {
    store,
    rating,
    days,
  }: { store: PublicStore; rating: StoreRating | null; days: StoreDays },
  text: Text,
  search: string,
): void {
  const el = (selector: string) => find(root, selector, HTMLElement);
  document.title = text.t("store.page_title", { store: store.name });
  showAppBar(root, store, search, text);
  el("#store-title").textContent = store.name;
  const taking = !store.paused && store.normal_orders_on;
  el("#store-open").hidden = !taking;
  el("#store-closed").hidden = taking;

  const photo = find(root, "#cover-photo", HTMLImageElement);
  photo.hidden = store.cover_photo === null;
  if (store.cover_photo !== null) photo.src = store.cover_photo;

  const stars =
    rating === null
      ? null
      : { rating: rating.average.toFixed(1), count: rating.count };
  el("#fact-stars").textContent =
    stars === null
      ? text.t("store.rating.new")
      : text.t("store.rating.stars", stars);
  el("#fact-rating-words").textContent =
    stars === null
      ? text.t("store.rating.new_label")
      : text.t("store.rating.label", stars);

  const area = el("#fact-area");
  area.textContent = [store.area, store.city]
    .filter((part) => part !== null && part !== "")
    .join(", ");
  area.hidden = area.textContent === "";
  find(root, "#icon-pickup", SVGElement).toggleAttribute(
    "hidden",
    !store.offers_pickup,
  );
  find(root, "#icon-delivery", SVGElement).toggleAttribute(
    "hidden",
    !store.offers_delivery,
  );
  el("#fact-ways-text").textContent = text.t(
    store.offers_pickup && store.offers_delivery
      ? "store.fact.both"
      : store.offers_pickup
        ? "store.fact.pickup_only"
        : "store.fact.delivery_only",
  );
  el("#fact-ways").hidden = !store.offers_pickup && !store.offers_delivery;

  const next = taking ? days.next_free_day : null;
  el("#fact-next-day").hidden = next === null;
  if (next !== null) {
    const note = dayNote(next, days.today);
    el("#fact-next-day").textContent = text.t("store.day.next", {
      day:
        note === null
          ? text.day(next, "long")
          : text.t(note === "today" ? "store.day.today" : "store.day.tomorrow"),
    });
  }
  el("#fact-last-day").hidden = days.last_order_day === null;
  if (days.last_order_day !== null) {
    el("#fact-last-day-text").textContent = text.day(
      days.last_order_day,
      "long",
    );
  }
  el("#fact-fssai").hidden = store.fssai === null;
  el("#fact-fssai-number").textContent = store.fssai ?? "";
}
