import { categorySchema } from "../../shared/model.ts";
import type { SetupItem, SetupPack } from "../../shared/setup.ts";
import type { MenuItem, MenuSection, PublicStore } from "../../shared/store.ts";
import type { Draft } from "./draft.ts";

// Her draft in the shapes of the store page, so the preview is the store
// page: the same sections, the same order of packs, and no extras yet.
export function previewStore(draft: Draft): PublicStore {
  return {
    id: draft.store_id,
    slug: draft.slug,
    name: draft.name.trim(),
    cover_photo: draft.photo,
    area: draft.area.trim() || null,
    city: draft.city.trim() || null,
    offers_pickup: draft.offers_pickup,
    offers_delivery: draft.offers_delivery,
    accepts_online: false,
    advance_for_strangers: false,
    fssai: null,
    is_demo: false,
    paused: false,
    normal_orders_on: true,
  };
}

export function previewSections(items: readonly SetupItem[]): MenuSection[] {
  return categorySchema.options
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category).map(menuItemOf),
    }))
    .filter((section) => section.items.length > 0);
}

function menuItemOf(item: SetupItem): MenuItem {
  return {
    ...item,
    name_script: null,
    allergens: item.allergens ?? [],
    photo: null,
    special: false,
    sold_out: false,
    packs: [...item.packs].sort(bySize),
  };
}

function bySize(a: SetupPack, b: SetupPack): number {
  return (
    (a.grams ?? a.pieces ?? 0) - (b.grams ?? b.pieces ?? 0) || a.price - b.price
  );
}
