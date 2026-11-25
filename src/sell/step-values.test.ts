import assert from "node:assert/strict";
import { test } from "node:test";
import { createText } from "../text/text.ts";
import { newDraft } from "./draft.ts";
import { shareUrl, stepValue } from "./step-values.ts";
import { chakkuli, readyDraft, storeId } from "./test-draft.ts";

const text = createText("en");

test("each step shows what it holds", () => {
  const draft = readyDraft({ offers_delivery: true, furthest: "publish" });
  assert.equal(stepValue(draft, "language", text), "ಕನ್ನಡ");
  assert.equal(stepValue(draft, "items", text), "1 item");
  assert.equal(
    stepValue(
      { ...draft, items: [chakkuli(), chakkuli({ id: storeId })] },
      "items",
      text,
    ),
    "2 items",
  );
  assert.equal(stepValue(draft, "store", text), "/s/shobhas-kitchen");
  assert.equal(
    stepValue(draft, "ways", text),
    "Pickup and delivery · Basavanagudi",
  );
  assert.equal(
    stepValue({ ...draft, offers_delivery: false }, "ways", text),
    "Pickup only · Basavanagudi",
  );
  assert.equal(stepValue(draft, "preview", text), "Checked");
  assert.equal(stepValue(readyDraft(), "preview", text), "");
});

test("an empty step shows nothing", () => {
  const draft = newDraft(storeId);
  for (const step of [
    "language",
    "items",
    "store",
    "ways",
    "publish",
    "share",
  ] as const) {
    assert.equal(stepValue(draft, step, text), "", step);
  }
});

test("the WhatsApp link carries the whole message", () => {
  assert.equal(
    shareUrl(
      "Order from Shobha's Kitchen: https://x.sslip.io/s/shobhas-kitchen",
    ),
    "https://wa.me/?text=Order%20from%20Shobha's%20Kitchen%3A%20https%3A%2F%2Fx.sslip.io%2Fs%2Fshobhas-kitchen",
  );
});
