import assert from "node:assert/strict";
import { test } from "node:test";
import { deskQuoteSchema, type DeskQuote } from "../../shared/quotes.ts";
import { createText } from "../text/text.ts";
import {
  companyOf,
  placeOf,
  quoteCard,
  replyLink,
  unitAmount,
} from "./quote-card.ts";

const text = createText("en");
const buyer = {
  name: "Priya",
  phone: "+919876543210",
  language: "en",
} as const;
const base = {
  id: "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60",
  created_at: 1_795_450_950_267,
  buyer,
  note_translation: null,
  place_translation: null,
  company_translation: null,
};
const itemId = "5f51e217-1da8-4358-9d21-196f83ea559f";

const bulk: DeskQuote = deskQuoteSchema.parse({
  ...base,
  kind: "bulk",
  request: {
    kind: "bulk",
    lines: [
      {
        item_id: itemId,
        name: "Kaju katli",
        quantity: 200,
        unit: "pieces",
        price: 3000,
      },
      {
        item_id: itemId,
        name: "Mysore pak",
        quantity: 5,
        unit: "kg",
        price: null,
      },
    ],
    estimate: 600_000,
    need_by: "2026-12-04",
    place: "Whitefield office",
    note: "Gift boxes please",
  },
});

const catering: DeskQuote = deskQuoteSchema.parse({
  ...base,
  kind: "catering",
  request: {
    kind: "catering",
    package: {
      id: itemId,
      name: "Silver plate",
      kind: "plate",
      price: 35_000,
      min_count: 100,
    },
    dishes: [{ category: "Sweets", names: ["Mysore pak", "Obbattu"] }],
    event: {
      date: "2026-12-12",
      guests: 120,
      place: "Jayanagar hall",
      service_style: "staff",
    },
    service_extra: 4_000,
    estimate: 4_680_000,
    note: null,
  },
});

const boardPost: DeskQuote = deskQuoteSchema.parse({
  ...base,
  kind: "board_post",
  request: {
    kind: "board_post",
    board_post_id: itemId,
    company: "A tech company in Whitefield",
    items: [{ name: "Sweet box", quantity: 300, unit: "boxes" }],
    need_by: "2026-12-10",
    places: ["Whitefield", "Marathahalli"],
    budget_per_unit: 25_000,
    store_note: "I can deliver on the 9th",
    note: null,
  },
});

test("a bulk request lists each item with its amount and its price", () => {
  const card = quoteCard(bulk, text);
  assert.equal(card.title, "Bulk request");
  assert.deepEqual(card.rows, [
    { name: "Kaju katli", amount: "200 pieces", price: "₹30 a piece" },
    { name: "Mysore pak", amount: "5 kg", price: "Price on request" },
  ]);
  assert.deepEqual(card.facts, [
    { label: "Need by", value: "Friday, 4 December" },
  ]);
  assert.equal(card.placeLabel, "Place");
  assert.equal(card.estimate, "₹6,000");
  assert.equal(card.reply, "https://wa.me/919876543210");
});

test("a catering request shows the package, the dishes and the event", () => {
  const card = quoteCard(catering, text);
  assert.equal(card.title, "Catering request");
  assert.deepEqual(card.rows, [
    { name: "Silver plate", amount: "120 guests", price: "₹350 a plate" },
  ]);
  assert.deepEqual(card.facts, [
    { label: "Event day", value: "Saturday, 12 December" },
    { label: "Service", value: "With serving staff +₹40 a plate" },
    { label: "Sweets", value: "Mysore pak, Obbattu" },
  ]);
  assert.equal(card.placeLabel, "Area or venue");
  assert.equal(card.estimate, "₹46,800");
});

test("a buffet with its price on request says so", () => {
  const buffet = deskQuoteSchema.parse({
    ...catering,
    request: {
      ...catering.request,
      package: {
        ...(catering.request as { package: object }).package,
        kind: "buffet",
        price: null,
      },
      estimate: null,
    },
  });
  const card = quoteCard(buffet, text);
  assert.equal(card.rows[0]?.price, "Price on request");
  assert.equal(card.estimate, undefined);
  assert.equal(card.facts[1]?.value, "With serving staff +₹40 a guest");
});

test("a request from the request board shows the items, the budget and her note", () => {
  const card = quoteCard(boardPost, text);
  assert.equal(card.title, "From the request board");
  assert.deepEqual(card.rows, [
    { name: "Sweet box", amount: "300 boxes", price: "" },
  ]);
  assert.deepEqual(card.facts, [
    { label: "Need by", value: "Thursday, 10 December" },
    { label: "Budget", value: "₹250 a unit" },
    { label: "Your note", value: "I can deliver on the 9th" },
  ]);
  assert.equal(card.placeLabel, "Delivery places");
  assert.equal(card.estimate, undefined);
});

test("the place and the company are the buyer's words", () => {
  assert.equal(placeOf(bulk), "Whitefield office");
  assert.equal(placeOf(catering), "Jayanagar hall");
  assert.equal(placeOf(boardPost), "Whitefield; Marathahalli");
  assert.equal(companyOf(boardPost), "A tech company in Whitefield");
  assert.equal(companyOf(bulk), null);
});

test("amounts read in pieces, kg and boxes", () => {
  assert.equal(unitAmount(1, "pieces", text), "1 piece");
  assert.equal(unitAmount(2, "kg", text), "2 kg");
  assert.equal(unitAmount(1, "boxes", text), "1 box");
  assert.equal(unitAmount(1500, "boxes", text), "1,500 boxes");
});

test("a reply opens WhatsApp to the buyer's number", () => {
  assert.equal(replyLink("+447700900123"), "https://wa.me/447700900123");
});
