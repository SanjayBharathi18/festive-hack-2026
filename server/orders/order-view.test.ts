import assert from "node:assert/strict";
import { test } from "node:test";
import { packLabel } from "./order-data.ts";
import { mapUrl } from "./order-view.ts";

test("the map link searches her address, never her pin", () => {
  assert.equal(
    mapUrl({ address: "12, 4th Cross, Basavanagudi" }),
    "https://www.google.com/maps/search/?api=1&query=12%2C%204th%20Cross%2C%20Basavanagudi",
  );
  assert.equal(mapUrl({ address: null }), null);
});

test("a pack that she removed keeps a label from its amount", () => {
  assert.equal(packLabel(250, null), "250 g");
  assert.equal(packLabel(2000, null), "2 kg");
  assert.equal(packLabel(null, 6), "6 pcs");
  assert.equal(packLabel(null, null), "");
});
