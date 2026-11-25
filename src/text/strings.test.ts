import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { errorCodeSchema } from "../../shared/errors.ts";
import { clientErrorCodes } from "../api/api.ts";
import { voiceErrorCodes } from "../voice/voice-error.ts";
import en from "./en.json" with { type: "json" };
import hi from "./hi.json" with { type: "json" };
import kn from "./kn.json" with { type: "json" };
import mr from "./mr.json" with { type: "json" };
import ta from "./ta.json" with { type: "json" };
import te from "./te.json" with { type: "json" };
import type { Table } from "./text.ts";

const translations: Record<string, Table> = { hi, kn, ta, te, mr };
const english = leaves(en);

test("each value is a string that is not empty", () => {
  for (const [language, table] of Object.entries({ en, ...translations })) {
    for (const [key, value] of leaves(table)) {
      assert.notEqual(value.trim(), "", `${language}: ${key} is empty`);
    }
  }
});

test("each translated key is also in en.json", () => {
  for (const [language, table] of Object.entries(translations)) {
    for (const key of leaves(table).keys()) {
      assert.ok(english.has(key), `${language}: ${key} is not in en.json`);
    }
  }
});

test("each error code of the server, the API client and the voice has words", () => {
  const codes = [
    ...errorCodeSchema.options,
    ...clientErrorCodes,
    ...voiceErrorCodes,
  ];
  for (const code of codes) {
    assert.ok(english.has(`common.error.${code}`), `${code} has no words`);
  }
});

test("each common string is in all six languages", () => {
  const common = [...english.keys()].filter((key) => key.startsWith("common."));
  for (const [language, table] of Object.entries(translations)) {
    const keys = leaves(table);
    for (const key of common) {
      assert.ok(keys.has(key), `${language}: ${key} is missing`);
    }
  }
});

test("each translation keeps the parameters of the English string", () => {
  for (const [language, table] of Object.entries(translations)) {
    for (const [key, value] of leaves(table)) {
      assert.deepEqual(
        parameters(value),
        parameters(english.get(key) ?? ""),
        `${language}: ${key}`,
      );
    }
  }
});

test("each data-text key in the pages is in en.json", () => {
  const src = new URL("../", import.meta.url);
  const pages = readdirSync(src).filter((name) =>
    existsSync(new URL(`${name}/index.html`, src)),
  );
  assert.ok(pages.includes("home"));
  for (const page of pages) {
    const html = readFileSync(new URL(`${page}/index.html`, src), "utf8");
    for (const [, key] of html.matchAll(
      /data-text(?:-label|-placeholder)?="([^"]*)"/g,
    )) {
      assert.ok(english.has(key ?? ""), `${page}: ${key} is not in en.json`);
    }
  }
});

test("each common error and each voice, desk and checkout error below tells the user what to do next", () => {
  const nextSteps = new Set([
    "Add",
    "Allow",
    "Ask",
    "Check",
    "Choose",
    "Close",
    "Contact",
    "Enter",
    "Find",
    "Get",
    "Make",
    "Open",
    "Order",
    "Paste",
    "Pick",
    "Record",
    "Reload",
    "Remove",
    "Say",
    "See",
    "Send",
    "Sign",
    "Tap",
    "Try",
    "Type",
    "Use",
    "Wait",
  ]);
  const keys = [
    ...[...english.keys()].filter((key) => key.startsWith("common.error.")),
    "store.error.cannot_decode",
    "store.error.voice_off",
    "store.error.recording_missing",
    "desk.error.not_found",
    "desk.error.order_gone",
    "checkout.error.price_changed",
    "checkout.error.store_not_taking_orders",
  ];
  for (const key of keys) {
    const sentences = (english.get(key) ?? "").split(/(?<=[.?!])\s+/);
    assert.ok(
      sentences.some((sentence) =>
        nextSteps.has(sentence.split(/[\s,]/)[0] ?? ""),
      ),
      `${key} gives no next step`,
    );
  }
});

function leaves(table: Table, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [name, value] of Object.entries(table)) {
    const key = `${prefix}${name}`;
    if (typeof value === "string") {
      found.set(key, value);
    } else {
      for (const [inner, text] of leaves(value, `${key}.`)) {
        found.set(inner, text);
      }
    }
  }
  return found;
}

function parameters(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)]
    .map(([, name]) => name ?? "")
    .sort();
}
