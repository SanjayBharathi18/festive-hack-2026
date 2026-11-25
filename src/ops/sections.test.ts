import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bindSections,
  sectionFromHash,
  sections,
  type Section,
  type SectionPanel,
} from "./sections.ts";

test("the fragment names the section, and the incident comes first", () => {
  assert.equal(sectionFromHash("#flagsmith"), "flagsmith");
  assert.equal(sectionFromHash("sarvam"), "sarvam");
  assert.equal(sectionFromHash(""), "nudgebee");
  assert.equal(sectionFromHash("#other"), "nudgebee");
});

test("a chosen radio shows its panel alone and keeps the fragment", () => {
  const listeners = new Map<string, () => void>();
  const radios = sections.map((value) => ({
    value,
    checked: false,
    addEventListener: (_: "change", listener: () => void) =>
      void listeners.set(value, listener),
  }));
  const panels = new Map<Section, SectionPanel>(
    sections.map((name) => [name, { hidden: false }]),
  );
  const shown: Section[] = [];
  const hashes: string[] = [];
  const bound = bindSections({
    radios,
    panel: (name) => panels.get(name) ?? { hidden: true },
    hash: "#sarvam",
    keepHash: (hash) => void hashes.push(hash),
    onShow: (section) => void shown.push(section),
  });
  assert.equal(bound.current(), "sarvam");
  assert.deepEqual(
    sections.map((name) => panels.get(name)?.hidden),
    [true, true, false],
  );
  const flagsmith = radios[0];
  if (flagsmith === undefined) throw new Error("no radio");
  flagsmith.checked = true;
  listeners.get("flagsmith")?.();
  assert.equal(bound.current(), "flagsmith");
  assert.deepEqual(
    sections.map((name) => panels.get(name)?.hidden),
    [false, true, true],
  );
  assert.deepEqual(
    radios.map(({ checked }) => checked),
    [true, false, false],
  );
  assert.deepEqual(shown, ["sarvam", "flagsmith"]);
  assert.deepEqual(hashes, ["#flagsmith"]);
});
