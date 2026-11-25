import type { Day } from "../../shared/day.ts";
import type {
  Asked,
  Draft,
  DraftItem,
  DraftPack,
  UnmatchedItem,
} from "../../shared/reading.ts";
import { resolveDay } from "./day-words.ts";
import { matchItem, type ReadingItem } from "./menu.ts";
import { choosePacks, type PackCount } from "./packs.ts";
import type { Reading } from "./prompt.ts";

export type DraftParts = Omit<Draft, "order_id" | "capacity">;

export function buildDraft(
  menu: readonly ReadingItem[],
  reading: Reading,
  today: Day,
): DraftParts {
  const items = new Map<string, DraftItem>();
  const unmatched: UnmatchedItem[] = [];
  for (const read of reading.items) {
    const asked: Asked = {
      quantity: read.quantity,
      unit: read.unit,
      pack_grams: wholeSize(read.pack_grams),
      pack_pieces: wholeSize(read.pack_pieces),
    };
    const said = read.said.trim();
    const match = matchItem(menu, [read.menu_name, said]);
    const choice = match && choosePacks(match.item.packs, asked);
    if (match === undefined || choice === undefined) {
      unmatched.push({ said, asked });
      continue;
    }
    const draftItem: DraftItem = {
      item_id: match.item.id,
      name: match.item.name,
      said,
      asked,
      packs: choice.packs.map(draftPack),
      near_amount: choice.near,
      near_name: match.near,
      sold_out: match.item.sold_out,
    };
    const earlier = items.get(match.item.id);
    items.set(
      match.item.id,
      earlier === undefined ? draftItem : merged(earlier, draftItem),
    );
  }
  const list = [...items.values()];
  return {
    items: list,
    unmatched,
    day: resolveDay(today, reading.day, reading.date),
    fulfilment: reading.fulfilment,
    buyer_name: text(reading.buyer_name),
    address: text(reading.address),
    note: text(reading.note),
    total: draftTotal(list),
  };
}

export function emptyDraft(): DraftParts {
  return {
    items: [],
    unmatched: [],
    day: null,
    fulfilment: null,
    buyer_name: null,
    address: null,
    note: null,
    total: 0,
  };
}

export function draftTotal(items: readonly DraftItem[]): number {
  return items
    .filter((item) => !item.sold_out)
    .flatMap((item) => item.packs)
    .reduce((total, pack) => total + pack.price * pack.quantity, 0);
}

function merged(earlier: DraftItem, later: DraftItem): DraftItem {
  const packs = new Map(
    earlier.packs.map((pack) => [pack.pack_id, { ...pack }]),
  );
  for (const pack of later.packs) {
    const same = packs.get(pack.pack_id);
    if (same === undefined) packs.set(pack.pack_id, { ...pack });
    else same.quantity = Math.min(999, same.quantity + pack.quantity);
  }
  return {
    ...earlier,
    said: `${earlier.said}, ${later.said}`,
    packs: [...packs.values()],
    near_amount: earlier.near_amount || later.near_amount,
    near_name: earlier.near_name || later.near_name,
  };
}

function draftPack({ pack, quantity }: PackCount): DraftPack {
  return {
    pack_id: pack.id,
    label: pack.label,
    quantity,
    price: pack.price,
    grams: pack.grams,
    pieces: pack.pieces,
  };
}

function wholeSize(size: number | null): number | null {
  if (size === null) return null;
  const whole = Math.round(size);
  return whole > 0 ? whole : null;
}

function text(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
