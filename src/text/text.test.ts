import assert from "node:assert/strict";
import { test } from "node:test";
import hi from "./hi.json" with { type: "json" };
import kn from "./kn.json" with { type: "json" };
import mr from "./mr.json" with { type: "json" };
import { createText, type TextKey } from "./text.ts";

test("t gives the string in the language", () => {
  assert.equal(createText("hi", hi).t("common.badge.demo"), "डेमो");
  assert.equal(createText("en").t("common.badge.recorded"), "Recorded");
});

test("a missing string falls back to English", () => {
  const text = createText("hi", { common: { badge: { demo: "डेमो" } } });
  assert.equal(text.t("common.badge.demo"), "डेमो");
  assert.equal(text.t("common.action.undo"), "Undo");
});

test("t fills the parameters", () => {
  assert.equal(
    createText("en").t("common.error.rate_limited", { seconds: 30 }),
    "Too many tries. Wait 30 s, then try again.",
  );
});

test("a key that no table has comes back as the key", () => {
  assert.equal(
    createText("en").t("common.nothing" as TextKey),
    "common.nothing",
  );
});

test("apply fills text, labels and placeholders, and keeps unknown keys", () => {
  const elements = [
    fakeElement({ "data-text": "common.badge.demo" }, "Demo"),
    fakeElement({ "data-text-label": "common.action.close" }, ""),
    fakeElement(
      {
        "data-text": "page.unknown",
        "data-text-placeholder": "common.action.record",
      },
      "Kept",
    ),
  ];
  createText("kn", kn).apply({ querySelectorAll: () => elements });
  assert.equal(elements[0]?.textContent, "ಡೆಮೊ");
  assert.equal(elements[1]?.getAttribute("aria-label"), "ಮುಚ್ಚಿ");
  assert.equal(elements[2]?.textContent, "Kept");
  assert.equal(elements[2]?.getAttribute("placeholder"), "ರೆಕಾರ್ಡ್ ಮಾಡಿ");
});

test("error says what to do next, from the code of the error", () => {
  const en = createText("en");
  assert.equal(en.error(coded("network")), "No network. Try again.");
  assert.equal(
    en.error(coded("rate_limited", { seconds: 60 })),
    "Too many tries. Wait 60 s, then try again.",
  );
  assert.equal(
    createText("kn", kn).error(coded("network")),
    "ನೆಟ್‌ವರ್ಕ್ ಇಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  );
});

test("an unknown error gets the general message", () => {
  const en = createText("en");
  assert.equal(en.error(new Error("boom")), "Something went wrong. Try again.");
  assert.equal(
    en.error(coded("brand_new_code")),
    "Something went wrong. Try again.",
  );
  assert.equal(en.error("text"), "Something went wrong. Try again.");
});

test("a page can give its own words for an error", () => {
  const text = createText("en", {
    store: { error: { cannot_decode: "Add the items from the list instead." } },
  });
  assert.equal(
    text.error(coded("cannot_decode"), "store"),
    "Add the items from the list instead.",
  );
  assert.equal(text.error(coded("network"), "store"), "No network. Try again.");
});

test("the desk tells an order that is gone apart from a store that is missing", () => {
  const en = createText("en");
  assert.equal(
    en.error(coded("order_gone"), "desk"),
    "This order is not on your desk any more. Reload the board.",
  );
  assert.equal(
    en.error(coded("not_found"), "desk"),
    "Your store is not on the app yet. Make your store first.",
  );
});

test("a cancelled wait has nothing to say", () => {
  const abort = new DOMException("The user cancelled.", "AbortError");
  assert.equal(createText("en").error(abort), "");
});

test("pieces follow the plural rules of the language", () => {
  const en = createText("en");
  assert.equal(en.pieces(1), "1 piece");
  assert.equal(en.pieces(12), "12 pieces");
  assert.equal(en.pieces(1000), "1,000 pieces");
  assert.equal(createText("hi", hi).pieces(6), "6 पीस");
});

test("days show the weekday in the language, in IST, with Latin digits", () => {
  assert.equal(createText("en").day("2026-11-28"), "Saturday, 28 November");
  assert.equal(createText("en").day("2026-11-28", "short"), "Sat, 28 Nov");
  assert.equal(createText("kn", kn).day("2026-11-28", "weekday"), "ಶನಿವಾರ");
  assert.equal(createText("hi", hi).day("2026-11-28", "short"), "शनि, 28 नव॰");
  assert.equal(createText("mr", mr).day("2026-11-28", "short"), "शनि, 28 नोव्हें");
});

function coded(code: string, params?: Record<string, number>) {
  return Object.assign(new Error(code), { code, params });
}

function fakeElement(attributes: Record<string, string>, textContent: string) {
  const values = new Map(Object.entries(attributes));
  return {
    textContent: textContent as string | null,
    getAttribute: (name: string) => values.get(name) ?? null,
    setAttribute: (name: string, value: string) => void values.set(name, value),
  };
}
