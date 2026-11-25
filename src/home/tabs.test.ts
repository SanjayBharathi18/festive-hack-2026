import assert from "node:assert/strict";
import { test } from "node:test";
import { createTabs, hashOfTab, tabFromHash, type TabName } from "./tabs.ts";

function setup() {
  const panels = {
    food: { hidden: false },
    bulk: { hidden: true },
    catering: { hidden: true },
  };
  const mounted: TabName[] = [];
  const tabs = createTabs({ panels, onFirstShow: (tab) => mounted.push(tab) });
  return { panels, mounted, tabs };
}

test("one panel shows at a time", () => {
  const { panels, tabs } = setup();
  tabs.show("catering");
  assert.deepEqual(panels, {
    food: { hidden: true },
    bulk: { hidden: true },
    catering: { hidden: false },
  });
});

test("each panel mounts once, the first time it shows", () => {
  const { mounted, tabs } = setup();
  tabs.show("food");
  tabs.show("bulk");
  tabs.show("food");
  tabs.show("bulk");
  assert.deepEqual(mounted, ["food", "bulk"]);
});

test("the address names the tab, and Order food is the plain homepage", () => {
  assert.equal(tabFromHash("#bulk"), "bulk");
  assert.equal(tabFromHash("#catering"), "catering");
  assert.equal(tabFromHash(""), "food");
  assert.equal(tabFromHash("#nothing"), "food");
  assert.equal(hashOfTab("food"), "");
  assert.equal(hashOfTab("catering"), "#catering");
});
