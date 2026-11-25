import assert from "node:assert/strict";
import { test } from "node:test";
import { appLanguageSchema } from "../../shared/languages.ts";
import { cancelReasonSchema } from "../../shared/orders.ts";
import {
  dayText,
  deskShareText,
  phrases,
  renderMessage,
  rupees,
  templateNames,
  type MessageValues,
} from "./templates.ts";

const values: MessageValues = {
  store: "Shobha's Kitchen",
  number: 13,
  lines: [
    { quantity: 2, name: "Mysore pak", label: "500 g" },
    { quantity: 1, name: "Chakkuli", label: "1 kg" },
  ],
  total: 130000,
  day: "2026-11-28",
  fulfilment: "pickup",
  pickupAddress: "12, 4th Cross, Basavanagudi",
  orderUrl: "https://34-12-56-78.sslip.io/o/abcdefghijklmnopqrstuv",
  storeChatUrl: "https://wa.me/919800000001?text=Hello",
  reason: "item_ran_out",
};

for (const language of appLanguageSchema.options) {
  for (const template of templateNames) {
    for (const fulfilment of ["pickup", "delivery"] as const) {
      test(`${template} in ${language} for ${fulfilment} renders and ends with the stop line`, () => {
        const body = renderMessage(template, language, {
          ...values,
          fulfilment,
        });
        const lines = body.split("\n");
        assert.equal(lines.at(-1), phrases[language].stop);
        assert.match(lines.at(-1) ?? "", /STOP/);
        assert.ok(
          lines.includes(`${phrases[language].seeOrder}: ${values.orderUrl}`),
        );
        assert.ok(
          lines.includes(
            `${phrases[language].messageStore}: ${values.storeChatUrl}`,
          ),
        );
        assert.match(body, /13/);
        assert.match(body, /Shobha's Kitchen/);
        assert.doesNotMatch(body, /undefined|null|NaN|�/);
        assert.equal(
          body.includes(values.pickupAddress ?? ""),
          fulfilment === "pickup" && template !== "order_cancelled",
        );
      });
    }
  }
}

test("order placed lists the items, the total, the day and the pickup address", () => {
  assert.equal(
    renderMessage("order_placed", "en", values),
    [
      "Your order 13 at Shobha's Kitchen is placed.",
      "2 × Mysore pak 500 g",
      "1 × Chakkuli 1 kg",
      "Total: ₹1,300",
      "Pickup: Saturday, 28 November",
      "Pickup address: 12, 4th Cross, Basavanagudi",
      `See your order: ${values.orderUrl}`,
      `Message the store: ${values.storeChatUrl}`,
      "To stop these messages, reply STOP.",
    ].join("\n"),
  );
});

test("order cancelled gives her reason in the buyer's language", () => {
  for (const language of appLanguageSchema.options) {
    for (const reason of cancelReasonSchema.options) {
      const body = renderMessage("order_cancelled", language, {
        ...values,
        reason,
      });
      assert.ok(body.includes(phrases[language].reasons[reason]));
    }
  }
  assert.match(
    renderMessage("order_cancelled", "en", { ...values, reason: null }),
    /Reason: Please message the store\./,
  );
});

test("the desk share text has the order page link and no stop line", () => {
  for (const language of appLanguageSchema.options) {
    const text = deskShareText(language, values);
    assert.equal(
      text.split("\n").at(-1),
      `${phrases[language].seeOrder}: ${values.orderUrl}`,
    );
    assert.doesNotMatch(text, /STOP/);
  }
});

test("rupees use Indian digit groups and show paise only when there are some", () => {
  assert.equal(rupees(0), "₹0");
  assert.equal(rupees(218000), "₹2,180");
  assert.equal(rupees(12345650), "₹1,23,456.50");
  assert.equal(rupees(1005), "₹10.05");
});

test("days show in the language, with Latin digits", () => {
  assert.equal(dayText("2026-11-28", "en"), "Saturday, 28 November");
  assert.equal(dayText("2026-11-28", "hi"), "शनिवार, 28 नवंबर");
  assert.equal(dayText("2026-11-28", "mr"), "शनिवार, 28 नोव्हेंबर");
  for (const language of appLanguageSchema.options) {
    assert.match(dayText("2026-11-28", language), /28/);
  }
});
