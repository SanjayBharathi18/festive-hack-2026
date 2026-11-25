import type { Day } from "../../shared/day.ts";
import type { Fulfilment } from "../../shared/model.ts";
import type { DeskSlip } from "../../shared/orders.ts";
import type {
  Asked,
  Draft as ReadDraft,
  DraftItem,
  UnmatchedItem,
} from "../../shared/reading.ts";
import type { MenuItem } from "../../shared/store.ts";

export type Line = {
  item_id: string;
  pack_id: string;
  name: string;
  label: string;
  quantity: number;
  price: number;
  grams: number | null;
  pieces: number | null;
};

export type Values = {
  lines: Line[];
  day: Day | null;
  fulfilment: Fulfilment | null;
  buyer_name: string;
  address: string;
  note: string;
};

export type Field =
  "items" | "day" | "fulfilment" | "buyer_name" | "address" | "note";
export type Need = "items" | "day" | "fulfilment" | "address";

export type ItemMark = {
  item_id: string;
  said: string;
  asked: Asked;
  nearAmount: boolean;
  nearName: boolean;
};

export type Draft = {
  initial: Values;
  filled: ReadonlySet<Field>;
  marks: ItemMark[];
  unmatched: UnmatchedItem[];
  soldOut: DraftItem[];
};

export type OrderFields = {
  day: Day;
  fulfilment: Fulfilment;
  address: string | null;
  note: string | null;
  buyer_name: string | null;
  cart: { pack_id: string; quantity: number }[];
};

export const fields: readonly Field[] = [
  "items",
  "day",
  "fulfilment",
  "buyer_name",
  "address",
  "note",
];

const maxQuantity = 999;

// What the model read becomes the values that she checks. A sold-out item
// stays out of the cart, as in the draft total and its capacity check.
export function draftFromReading(read: ReadDraft): Draft {
  const kept = read.items.filter((item) => !item.sold_out);
  const filled = new Set<Field>();
  if (read.items.length > 0) filled.add("items");
  if (read.day !== null) filled.add("day");
  if (read.fulfilment !== null) filled.add("fulfilment");
  if (read.buyer_name !== null) filled.add("buyer_name");
  if (read.address !== null) filled.add("address");
  if (read.note !== null) filled.add("note");
  return {
    initial: {
      lines: kept.flatMap((item) =>
        item.packs.map((pack) => ({
          item_id: item.item_id,
          pack_id: pack.pack_id,
          name: item.name,
          label: pack.label,
          quantity: pack.quantity,
          price: pack.price,
          grams: pack.grams,
          pieces: pack.pieces,
        })),
      ),
      day: read.day,
      fulfilment: read.fulfilment,
      buyer_name: read.buyer_name ?? "",
      address: read.address ?? "",
      note: read.note ?? "",
    },
    filled,
    marks: kept.map((item) => ({
      item_id: item.item_id,
      said: item.said,
      asked: item.asked,
      nearAmount: item.near_amount,
      nearName: item.near_name,
    })),
    unmatched: read.unmatched,
    soldOut: read.items.filter((item) => item.sold_out),
  };
}

export function emptyDraft(): Draft {
  return {
    initial: emptyValues(),
    filled: new Set(),
    marks: [],
    unmatched: [],
    soldOut: [],
  };
}

export function emptyValues(): Values {
  return {
    lines: [],
    day: null,
    fulfilment: null,
    buyer_name: "",
    address: "",
    note: "",
  };
}

export function valuesFromSlip(slip: DeskSlip): Values {
  return {
    lines: slip.lines.flatMap((line) =>
      line.pack_id === null
        ? []
        : [
            {
              item_id: line.item_id,
              pack_id: line.pack_id,
              name: line.name,
              label: line.label,
              quantity: line.quantity,
              price: line.price,
              grams: line.grams,
              pieces: line.pieces,
            },
          ],
    ),
    day: slip.day,
    fulfilment: slip.fulfilment,
    buyer_name: slip.buyer_name ?? "",
    address: slip.address ?? "",
    note: slip.note ?? "",
  };
}

// The experiment counts orders saved as the model read them. A draft is
// edited when what she saves differs from what the model gave: a change
// that she makes and takes back is no correction.
export function isEdited(initial: Values, current: Values): boolean {
  return JSON.stringify(normal(initial)) !== JSON.stringify(normal(current));
}

export function withQuantity(
  values: Values,
  packId: string,
  quantity: number,
): Values {
  const count = Math.min(maxQuantity, Math.max(0, Math.round(quantity)));
  return {
    ...values,
    lines:
      count === 0
        ? values.lines.filter((line) => line.pack_id !== packId)
        : values.lines.map((line) =>
            line.pack_id === packId ? { ...line, quantity: count } : line,
          ),
  };
}

export function withPack(
  values: Values,
  menu: readonly MenuItem[],
  packId: string,
): Values {
  const known = values.lines.find((line) => line.pack_id === packId);
  if (known !== undefined) {
    return withQuantity(values, packId, known.quantity + 1);
  }
  for (const item of menu) {
    const pack = item.packs.find((each) => each.id === packId);
    if (pack === undefined) continue;
    const line: Line = {
      item_id: item.id,
      pack_id: pack.id,
      name: item.name,
      label: pack.label,
      quantity: 1,
      price: pack.price,
      grams: pack.grams,
      pieces: pack.pieces,
    };
    return { ...values, lines: [...values.lines, line] };
  }
  return values;
}

export function missing(values: Values): Need[] {
  const needs: Need[] = [];
  if (values.lines.length === 0) needs.push("items");
  if (values.day === null) needs.push("day");
  if (values.fulfilment === null) needs.push("fulfilment");
  if (values.fulfilment === "delivery" && values.address.trim() === "") {
    needs.push("address");
  }
  return needs;
}

export function totalOf(values: Values): number {
  return values.lines.reduce(
    (total, line) => total + line.price * line.quantity,
    0,
  );
}

export function orderFields(values: Values): OrderFields | undefined {
  const { day, fulfilment } = values;
  if (missing(values).length > 0 || day === null || fulfilment === null) {
    return undefined;
  }
  return {
    day,
    fulfilment,
    address: fulfilment === "delivery" ? values.address.trim() : null,
    note: values.note.trim() || null,
    buyer_name: values.buyer_name.trim() || null,
    cart: values.lines.map(({ pack_id, quantity }) => ({ pack_id, quantity })),
  };
}

// The lines of one item, in the order they came, for a row that names the
// item once.
export function itemGroups(lines: readonly Line[]): Line[][] {
  const groups = new Map<string, Line[]>();
  for (const line of lines) {
    groups.set(line.item_id, [...(groups.get(line.item_id) ?? []), line]);
  }
  return [...groups.values()];
}

function normal(values: Values) {
  return {
    lines: values.lines
      .filter((line) => line.quantity > 0)
      .map((line) => [line.pack_id, line.quantity] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
    day: values.day,
    fulfilment: values.fulfilment,
    buyer_name: values.buyer_name.trim(),
    address: values.fulfilment === "pickup" ? "" : values.address.trim(),
    note: values.note.trim(),
  };
}

// The notes of the cascade, in the order of the form: one for each field
// that the model filled, and one for each needed field that it did not hear.
// A field to check plays unsure: a needed field not heard, and the items when
// one matched only nearly, was not on the menu or is sold out. count is the
// number of fields that the model filled.
export function filledFields(draft: Draft): {
  count: number;
  notes: number;
  unsure: number[];
} {
  const needs = new Set<Field>(missing(draft.initial));
  const checkItems =
    draft.marks.some((mark) => mark.nearAmount || mark.nearName) ||
    draft.unmatched.length > 0 ||
    draft.soldOut.length > 0;
  const played = fields.filter(
    (field) => draft.filled.has(field) || needs.has(field),
  );
  return {
    count: fields.filter((field) => draft.filled.has(field)).length,
    notes: played.length,
    unsure: played.flatMap((field, index) =>
      needs.has(field) || (field === "items" && checkItems) ? [index] : [],
    ),
  };
}
