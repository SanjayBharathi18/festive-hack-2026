import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buyerLines,
  deskShareUrl,
  orderUrl,
  storeChatUrl,
  waLink,
  type MessageOrder,
} from "./links.ts";

const order: MessageOrder = {
  id: "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60",
  number: 7,
  token: "abcdefghijklmnopqrstuv",
  source: "desk",
  buyerPhone: "+919876543210",
  buyerLanguage: "hi",
  day: "2026-11-29",
  fulfilment: "delivery",
  total: 88000,
  cancelReason: null,
  lines: [
    {
      item_id: "5b0f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a61",
      quantity: 1,
      name: "Mysore pak",
      name_latin: null,
      label: "1 kg",
    },
  ],
  store: {
    name: "Shobha's Kitchen",
    address: "12, 4th Cross, Basavanagudi",
    sellerPhone: "+919800000001",
  },
};

test("a wa.me link has the full number with no plus, and the encoded text", () => {
  assert.equal(
    waLink("+91 98765-43210", "Hi & bye\n₹450"),
    "https://wa.me/919876543210?text=Hi%20%26%20bye%0A%E2%82%B9450",
  );
});

test("a wa.me link with no number lets the person pick a contact", () => {
  assert.equal(waLink(null, "Hello"), "https://wa.me/?text=Hello");
});

test("a wa.me link with no text opens the chat", () => {
  assert.equal(waLink("+919800000001"), "https://wa.me/919800000001");
});

test("the order page link comes from PUBLIC_URL", () => {
  assert.equal(
    orderUrl("https://34-12-56-78.sslip.io", "abcdefghijklmnopqrstuv"),
    "https://34-12-56-78.sslip.io/o/abcdefghijklmnopqrstuv",
  );
});

test("Message the store opens a chat with her number, in the buyer's language", () => {
  const url = new URL(storeChatUrl(order));
  assert.equal(url.origin + url.pathname, "https://wa.me/919800000001");
  assert.equal(url.searchParams.get("text"), "नमस्ते, यह मेरे ऑर्डर 7 के बारे में है।");
});

test("Send on WhatsApp fills in the order and its page link", () => {
  const url = new URL(deskShareUrl(order, "https://34-12-56-78.sslip.io"));
  assert.equal(url.origin + url.pathname, "https://wa.me/919876543210");
  const text = url.searchParams.get("text") ?? "";
  assert.match(text, /1 × Mysore pak 1 kg/);
  assert.match(text, /₹880/);
  assert.match(
    text,
    /https:\/\/34-12-56-78\.sslip\.io\/o\/abcdefghijklmnopqrstuv$/,
  );
  const unknownBuyer = new URL(
    deskShareUrl(
      { ...order, buyerPhone: null, buyerLanguage: null },
      "https://34-12-56-78.sslip.io",
    ),
  );
  assert.equal(unknownBuyer.pathname, "/");
  assert.match(unknownBuyer.searchParams.get("text") ?? "", /^Your order 7/);
});

test("buyerLines names each dish in English, and in another language in its script first, then in English", () => {
  const lines = order.lines.map((line) => ({
    ...line,
    name: "ಮೈಸೂರು ಪಾಕ್",
    name_latin: "Mysore pak",
  }));
  const id = lines[0]?.item_id ?? "";
  assert.deepEqual(buyerLines(lines, "hi", new Map([[id, "मैसूर पाक"]])), [
    { quantity: 1, name: "मैसूर पाक · Mysore pak", label: "1 kg" },
  ]);
  assert.equal(buyerLines(lines, "hi")[0]?.name, "Mysore pak");
  assert.equal(buyerLines(lines, "en")[0]?.name, "Mysore pak");
  assert.equal(
    buyerLines(lines, "en", new Map([[id, "Mysore pak"]]))[0]?.name,
    "Mysore pak",
  );
  assert.equal(buyerLines(lines, "kn")[0]?.name, "ಮೈಸೂರು ಪಾಕ್ · Mysore pak");
  const text = new URL(
    deskShareUrl({ ...order, lines }, "https://34-12-56-78.sslip.io"),
  ).searchParams.get("text");
  assert.match(text ?? "", /1 × Mysore pak 1 kg/);
});
