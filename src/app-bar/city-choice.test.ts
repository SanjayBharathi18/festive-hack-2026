import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addressWithCity,
  availableCity,
  chosenCity,
  cityLabel,
  cityStorageKey,
  nearestCity,
  readCity,
  saveCity,
} from "./city-choice.ts";

const choices = [
  { key: "bengaluru", centre: { lat: 12.9716, lng: 77.5946 } },
  { key: "mumbai", centre: { lat: 19.076, lng: 72.8777 } },
  { key: "pune", centre: { lat: 18.5204, lng: 73.8567 } },
  { key: "udupi", centre: null },
];

test("the city of a page comes from its address, else the last choice, else Bengaluru", () => {
  assert.equal(chosenCity("mumbai", "pune"), "mumbai");
  assert.equal(chosenCity("Bombay", null), "mumbai");
  assert.equal(chosenCity(null, "pune"), "pune");
  assert.equal(chosenCity("", " "), "bengaluru");
  assert.equal(chosenCity("x".repeat(61), null), "bengaluru");
  assert.equal(chosenCity(null, null), "bengaluru");
});

test("a city with no store gives way to Bengaluru, else to the first city", () => {
  assert.equal(availableCity("pune", choices), "pune");
  assert.equal(availableCity("nagpur", choices), "bengaluru");
  assert.equal(availableCity("nagpur", choices.slice(1)), "mumbai");
  assert.equal(availableCity("nagpur", []), "nagpur");
});

test("the nearest city with stores is the one with the nearest centre", () => {
  assert.equal(nearestCity({ lat: 18.6, lng: 73.8 }, choices), "pune");
  assert.equal(nearestCity({ lat: 12.912, lng: 77.647 }, choices), "bengaluru");
  assert.equal(nearestCity({ lat: 13.34, lng: 74.74 }, choices), "bengaluru");
  assert.equal(nearestCity({ lat: 19, lng: 73 }, [choices[3]!]), undefined);
});

test("the choice is kept in storage, and a broken storage only reports", () => {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  assert.equal(readCity(storage), null);
  saveCity(storage, "mumbai");
  assert.equal(items.get(cityStorageKey), "mumbai");
  assert.equal(readCity(storage), "mumbai");
  const reports: string[] = [];
  const broken = {
    ...storage,
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.equal(readCity(broken), null);
  saveCity(broken, "pune", (message) => reports.push(message));
  assert.equal(reports.length, 1);
  assert.equal(readCity(undefined), null);
});

test("the address keeps its other values and its hash with the city", () => {
  assert.equal(
    addressWithCity(
      { pathname: "/", search: "?lang=hi&city=pune&q=laddu", hash: "#bulk" },
      "mumbai",
    ),
    "/?lang=hi&city=mumbai&q=laddu#bulk",
  );
  assert.equal(
    addressWithCity(
      { pathname: "/board-posts/new", search: "", hash: "" },
      "navi mumbai",
    ),
    "/board-posts/new?city=navi+mumbai",
  );
});

test("a city shows in English, and in another language its own name comes first, then the English one", () => {
  const labels = {
    en: "Bengaluru",
    hi: "बेंगलुरु",
    kn: "ಬೆಂಗಳೂರು",
    ta: "பெங்களூரு",
    te: "బెంగళూరు",
    mr: "बेंगळुरू",
  };
  assert.equal(cityLabel(labels, "en"), "Bengaluru");
  assert.equal(cityLabel(labels, "kn"), "ಬೆಂಗಳೂರು · Bengaluru");
  const udupi = Object.fromEntries(
    Object.keys(labels).map((language) => [language, "Udupi"]),
  ) as typeof labels;
  assert.equal(cityLabel(udupi, "hi"), "Udupi");
});
