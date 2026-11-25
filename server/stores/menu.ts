import type { Category, VegMark } from "../../shared/model.ts";
import { categorySchema } from "../../shared/model.ts";
import type { MenuItem, MenuSection, Pack } from "../../shared/store.ts";
import type { Db } from "../db/database.ts";

type ItemRow = {
  id: string;
  name: string;
  name_latin: string | null;
  category: Category;
  veg_mark: VegMark;
  allergens: string;
  box_contents: string | null;
  photo: string | null;
  special: number;
  sold_out: number;
};

type PackRow = Pack & { item_id: string };

export function getMenu(db: Db, storeId: string): MenuItem[] {
  const items = db
    .prepare(
      `SELECT id, name, name_latin, category, veg_mark, allergens, box_contents,
        photo, special, sold_out
      FROM items WHERE store_id = ? AND in_menu = 1 ORDER BY rowid`,
    )
    .all(storeId) as ItemRow[];
  const packs = db
    .prepare(
      `SELECT packs.id, packs.item_id, packs.label, packs.grams, packs.pieces,
        packs.price
      FROM packs JOIN items ON items.id = packs.item_id
      WHERE items.store_id = ? AND items.in_menu = 1
      ORDER BY coalesce(packs.grams, packs.pieces), packs.price, packs.rowid`,
    )
    .all(storeId) as PackRow[];
  const packsOfItem = Map.groupBy(packs, (pack) => pack.item_id);
  return items.map((item) => ({
    ...item,
    name_script: null,
    allergens: JSON.parse(item.allergens) as string[],
    special: item.special === 1,
    sold_out: item.sold_out === 1,
    packs: (packsOfItem.get(item.id) ?? []).map(
      ({ item_id: _, ...pack }) => pack,
    ),
  }));
}

export function menuSections(menu: readonly MenuItem[]): MenuSection[] {
  const sections = categorySchema.options
    .map((category) => ({
      category,
      items: menu
        .filter((item) => item.category === category)
        .sort((a, b) => Number(b.special) - Number(a.special)),
    }))
    .filter((section) => section.items.length > 0);
  return sections.sort((a, b) => specialFirst(b) - specialFirst(a));
}

function specialFirst(section: MenuSection): number {
  return Number(section.items.some((item) => item.special));
}
