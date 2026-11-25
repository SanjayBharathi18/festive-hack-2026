import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addressWithLanguage,
  keepLanguage,
  languageKey,
  pageLanguage,
} from "./language.ts";

test("each page is in English when the person picked no language", () => {
  assert.equal(pageLanguage(null, {}), "en");
  assert.equal(
    pageLanguage(undefined, { visit: memoryStore(), visits: memoryStore() }),
    "en",
  );
});

test("?lang= comes first, and the visit keeps it for the next pages", () => {
  const visit = memoryStore();
  const visits = memoryStore({ [languageKey]: "hi" });
  assert.equal(pageLanguage("kn", { visit, visits }), "kn");
  assert.equal(visit.getItem(languageKey), "kn");
  assert.equal(visits.getItem(languageKey), "hi");
  assert.equal(pageLanguage(null, { visit, visits }), "kn");
  assert.equal(pageLanguage("ta-IN", { visit, visits }), "ta");
});

test("then the choice of the visit, then the choice of her last visits", () => {
  const visits = memoryStore({ [languageKey]: "mr" });
  assert.equal(pageLanguage(null, { visits }), "mr");
  assert.equal(
    pageLanguage(null, {
      visit: memoryStore({ [languageKey]: "te" }),
      visits,
    }),
    "te",
  );
});

test("an unknown ?lang= or a stored value that the app has not falls through", () => {
  const visit = memoryStore({ [languageKey]: "ta" });
  assert.equal(pageLanguage("bn", { visit }), "ta");
  assert.equal(
    pageLanguage("", { visits: memoryStore({ [languageKey]: "fr" }) }),
    "en",
  );
});

test("tags match in any case, with - or _", () => {
  assert.equal(pageLanguage("HI", {}), "hi");
  assert.equal(pageLanguage("kn_IN", {}), "kn");
});

test("without storage, ?lang= still works on its own page", () => {
  const broken = {
    getItem: (): string | null => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(pageLanguage("mr", { visit: broken, visits: broken }), "mr");
  assert.equal(pageLanguage(null, { visit: broken, visits: broken }), "en");
  keepLanguage("te", [broken, undefined]);
});

test("the language select keeps the choice for the visit and the next visits", () => {
  const visit = memoryStore();
  const visits = memoryStore();
  keepLanguage("kn", [visit, visits]);
  assert.equal(visit.getItem(languageKey), "kn");
  assert.equal(visits.getItem(languageKey), "kn");
});

test("the address in another language keeps its other values", () => {
  assert.equal(
    addressWithLanguage(
      {
        pathname: "/s/shobhas-kitchen",
        search: "?via=market&lang=en",
        hash: "#menu",
      },
      "hi",
    ),
    "/s/shobhas-kitchen?via=market&lang=hi#menu",
  );
  assert.equal(
    addressWithLanguage({ pathname: "/desk", search: "", hash: "" }, "ta"),
    "/desk?lang=ta",
  );
});

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}
