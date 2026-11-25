import assert from "node:assert/strict";
import { test } from "node:test";
import { createText } from "../text/text.ts";
import {
  amountWords,
  quoteSummary,
  serviceWords,
  unitPrice,
  waLink,
} from "./summary.ts";

const text = createText("en");
const id = "00000000-0000-4000-8000-000000000001";

test("a bulk request sums up its lines, need-by day, place and estimate", () => {
  const summary = quoteSummary(
    {
      kind: "bulk",
      lines: [
        {
          item_id: id,
          name: "Kaju katli",
          quantity: 600,
          unit: "pieces",
          price: 1500,
        },
        {
          item_id: id,
          name: "Gift box",
          quantity: 100,
          unit: "pieces",
          price: null,
        },
      ],
      estimate: null,
      need_by: "2026-11-28",
      place: "HSR Layout office",
      note: "With our logo",
    },
    { store: "Ghar Ki Mithai", buyer: "Meera" },
    text,
  );
  assert.deepEqual(summary.split("\n"), [
    "Hello Ghar Ki Mithai, I sent you a bulk request on Plattr.",
    "Kaju katli: 600 pieces (₹15 a piece)",
    "Gift box: 100 pieces (Price on request)",
    `Need by ${text.day("2026-11-28", "long")}`,
    "Place: HSR Layout office",
    "Note: With our logo",
    "From Meera",
  ]);
});

test("a bulk line takes the name that the buyer read, when the page gives one", () => {
  const summary = quoteSummary(
    {
      kind: "bulk",
      lines: [
        {
          item_id: id,
          name: "ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್",
          quantity: 30,
          unit: "pieces",
          price: 42_000,
        },
      ],
      estimate: 12_600_00,
      need_by: null,
      place: null,
      note: null,
    },
    {
      store: "Shobha's Kitchen",
      buyer: "Meera",
      names: new Map([[id, "Diwali assorted box"]]),
    },
    text,
  );
  assert.equal(
    summary.split("\n")[1],
    "Diwali assorted box: 30 pieces (₹420 a piece)",
  );
});

test("a catering request names the package, the dishes and the event", () => {
  const summary = quoteSummary(
    {
      kind: "catering",
      package: {
        id,
        name: "Silver plate",
        kind: "plate",
        price: 35_000,
        min_count: 100,
      },
      dishes: [
        { category: "Sweets", names: ["Gulab jamun", "Mysore pak"] },
        { category: "Mains", names: ["Bisi bele bath"] },
      ],
      event: {
        date: "2026-12-05",
        guests: 1200,
        place: "Jayanagar",
        service_style: "staff",
      },
      service_extra: 4_000,
      estimate: 46_800_000,
      note: null,
    },
    { store: "Daawat Caterers", buyer: "Meera" },
    text,
  );
  assert.deepEqual(summary.split("\n"), [
    "Hello Daawat Caterers, I sent you a catering request on Plattr.",
    "Silver plate, ₹350 a plate",
    "Sweets: Gulab jamun, Mysore pak",
    "Mains: Bisi bele bath",
    `${text.day("2026-12-05", "long")}, 1,200 guests, Jayanagar`,
    "With serving staff +₹40 a plate",
    "Estimate: ₹4,68,000",
    "From Meera",
  ]);
});

test("a board post answer names the company, the items and her note", () => {
  const summary = quoteSummary(
    {
      kind: "board_post",
      board_post_id: id,
      company: "A tech company in Whitefield",
      items: [
        { name: "Kaju katli", quantity: 1000, unit: "pieces" },
        { name: "Diwali box", quantity: 500, unit: "boxes" },
      ],
      need_by: "2026-12-04",
      places: ["Whitefield office", "Bellandur office"],
      budget_per_unit: 25_000,
      store_note: "We can do both.",
      note: null,
    },
    { store: "Ghar Ki Mithai", buyer: "Asha" },
    text,
  );
  assert.match(
    summary,
    /^Hello Ghar Ki Mithai, about our request on the Plattr board: A tech company in Whitefield\./,
  );
  assert.match(summary, /Kaju katli: 1,000 pieces\nDiwali box: 500 boxes/);
  assert.match(summary, /Place: Whitefield office; Bellandur office/);
  assert.match(
    summary,
    /Budget: ₹250 a unit\nYour note: We can do both\.\nFrom Asha$/,
  );
});

test("the WhatsApp link has the full number and the encoded text", () => {
  assert.equal(
    waLink("+910000000008", "Hello & welcome"),
    "https://wa.me/910000000008?text=Hello%20%26%20welcome",
  );
});

test("amounts and unit prices use the words of each unit", () => {
  assert.equal(amountWords(1, "pieces", text), "1 piece");
  assert.equal(amountWords(2500, "kg", text), "2,500 kg");
  assert.equal(unitPrice(130_000, "kg", text), "₹1,300 a kg");
  assert.equal(unitPrice(50_000, "buffet", text), "₹500 a guest");
  assert.equal(unitPrice(null, "plate", text), "Price on request");
});

test("a service style names what it adds to each plate or guest", () => {
  assert.equal(serviceWords("delivery", 0, "plate", text), "Delivery only");
  assert.equal(
    serviceWords("staff", 0, "plate", text),
    "With serving staff",
    "a style with no extra is its name alone",
  );
  assert.equal(
    serviceWords("live_counters", 7_500, "buffet", text),
    "With live counters +₹75 a guest",
  );
});
