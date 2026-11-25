import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import en from "../text/en.json" with { type: "json" };

const fragments = [
  "quotes/contact-dialog.html",
  "bulk/bulk-view.html",
  "home/bulk-panel.html",
  "home/catering-panel.html",
  "store/store-extras.html",
];

function has(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

test("each data-text key in the mounted markup is in en.json", () => {
  for (const fragment of fragments) {
    const html = readFileSync(
      new URL(`../${fragment}`, import.meta.url),
      "utf8",
    );
    const keys = [
      ...html.matchAll(/data-text(?:-label|-placeholder)?="([^"]*)"/g),
    ];
    assert.ok(keys.length > 0, fragment);
    for (const [, key = ""] of keys) {
      assert.ok(has(key), `${fragment}: ${key} is not in en.json`);
    }
  }
});
