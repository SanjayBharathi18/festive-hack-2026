import assert from "node:assert/strict";
import { test } from "node:test";
import type { MenuItem } from "../../shared/store.ts";
import kn from "../text/kn.json" with { type: "json" };
import { createText } from "../text/text.ts";
import { cartNotice } from "./cart-notice.ts";

const pack = {
  id: "00000000-0000-4000-8000-000000000001",
  label: "1 kg",
  grams: 1000,
  pieces: null,
  price: 90000,
};
const item: MenuItem = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "ಮೈಸೂರು ಪಾಕ್",
  name_latin: "Mysore pak",
  name_script: null,
  category: "sweets",
  veg_mark: "veg",
  allergens: ["dairy"],
  box_contents: null,
  photo: null,
  special: false,
  sold_out: false,
  packs: [pack],
};

test("each change to the kept cart says what happened", () => {
  const en = createText("en");
  assert.equal(
    cartNotice(
      [
        { kind: "sold_out", item, pack },
        { kind: "price", item, pack, before: 88000 },
        { kind: "gone", pack_id: "x" },
        { kind: "gone", pack_id: "y" },
      ],
      en,
    ),
    [
      "Mysore pak is sold out now, so it left your cart.",
      "Mysore pak, 1 kg, now costs ₹900. Your cart has the new price.",
      "An item is no longer on the menu, so it left your cart.",
    ].join(" "),
  );
  assert.equal(cartNotice([], en), "");
});

test("a Kannada reader reads the item in Kannada, then in English", () => {
  assert.match(
    cartNotice([{ kind: "sold_out", item, pack }], createText("kn", kn)),
    /ಮೈಸೂರು ಪಾಕ್ · Mysore pak/,
  );
});
