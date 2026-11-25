import { emptyCart } from "../cart/cart.ts";
import { find } from "../dom/dom.ts";
import { createMenuView, type MenuTemplates } from "../store/menu-view.ts";
import type { Text } from "../text/text.ts";
import type { Draft } from "./draft.ts";
import { previewSections, previewStore } from "./preview.ts";

export type PreviewView = { show(draft: Draft): void };

// Her store as buyers see it, drawn by the menu view of the store page. The
// steppers stay off: a preview takes no order.
export function createPreviewView({
  root,
  templates,
  text,
}: {
  root: HTMLElement;
  templates: MenuTemplates;
  text: Text;
}): PreviewView {
  const el = (selector: string) => find(root, selector, HTMLElement);
  let filter = el("#pv-categories");
  const allChip = find(filter, '[data-category=""]', HTMLElement).cloneNode(
    true,
  );

  return {
    show(draft) {
      const store = previewStore(draft);
      const path = `/s/${store.slug}`;
      el("#preview-path").textContent = path;
      el("#pv-path").textContent = path;
      el("#pv-title").textContent = store.name;
      const cover = find(root, "#pv-cover", HTMLImageElement);
      cover.hidden = store.cover_photo === null;
      if (store.cover_photo !== null) cover.src = store.cover_photo;
      const tile = el("#pv-tile");
      tile.hidden = store.cover_photo !== null;
      tile.textContent = store.name;
      el("#pv-area").textContent = [store.area, store.city]
        .filter((part) => part !== null)
        .join(", ");
      find(root, "#pv-icon-pickup", SVGElement).toggleAttribute(
        "hidden",
        !store.offers_pickup,
      );
      find(root, "#pv-icon-delivery", SVGElement).toggleAttribute(
        "hidden",
        !store.offers_delivery,
      );
      el("#pv-ways").textContent = text.t(
        store.offers_pickup && store.offers_delivery
          ? "store.fact.both"
          : store.offers_pickup
            ? "store.fact.pickup_only"
            : "store.fact.delivery_only",
      );
      const fresh = filter.cloneNode(false);
      if (!(fresh instanceof HTMLElement)) return;
      fresh.append(allChip.cloneNode(true));
      filter.replaceWith(fresh);
      filter = fresh;
      createMenuView({
        root: el("#pv-menu"),
        filter,
        templates,
        text,
        sections: previewSections(draft.items),
        cart: emptyCart,
        takingOrders: false,
        onStep: () => false,
        onPack: () => {},
      }).update(emptyCart, new Map(), () => false);
    },
  };
}
