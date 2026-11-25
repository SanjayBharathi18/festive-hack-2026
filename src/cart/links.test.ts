import assert from "node:assert/strict";
import { test } from "node:test";
import { brandHref, buyerHref, viaOf, withLanguage } from "./links.ts";

test("a link keeps via=market and a known language, and nothing else", () => {
  assert.equal(
    buyerHref("/s/shobhas-kitchen/checkout", "?via=market&lang=kn&utm=x"),
    "/s/shobhas-kitchen/checkout?via=market&lang=kn",
  );
  assert.equal(buyerHref("/o/abc", "?via=other&lang=xx"), "/o/abc");
  assert.equal(buyerHref("/o/abc", ""), "/o/abc");
});

test("a link can add its own values and a hash", () => {
  assert.equal(
    buyerHref("/s/shobhas-kitchen/checkout", "?lang=hi", {
      extra: { day: "2026-11-28" },
    }),
    "/s/shobhas-kitchen/checkout?lang=hi&day=2026-11-28",
  );
  assert.equal(
    buyerHref("/s/shobhas-kitchen", "?via=market", { hash: "#day" }),
    "/s/shobhas-kitchen?via=market#day",
  );
});

test("via is market or nothing", () => {
  assert.equal(viaOf("?via=market"), "market");
  assert.equal(viaOf("?via=Market"), undefined);
  assert.equal(viaOf(""), undefined);
});

test("an API path asks for the item names in the reader's script, except in English", () => {
  assert.equal(
    withLanguage("/api/stores/shobhas-kitchen", "hi"),
    "/api/stores/shobhas-kitchen?lang=hi",
  );
  assert.equal(withLanguage("/api/orders/abc", "en"), "/api/orders/abc");
});

test("from the seller's own link, the wordmark leads to her store; from the marketplace, back to it", () => {
  assert.equal(brandHref("shobhas-kitchen", ""), "/s/shobhas-kitchen");
  assert.equal(
    brandHref("shobhas-kitchen", "?lang=hi"),
    "/s/shobhas-kitchen?lang=hi",
  );
  assert.equal(brandHref("shobhas-kitchen", "?via=market"), "/");
  assert.equal(
    brandHref("shobhas-kitchen", "?via=market&lang=kn"),
    "/?lang=kn",
  );
});
