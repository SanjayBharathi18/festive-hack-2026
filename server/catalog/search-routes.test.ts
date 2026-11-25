import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  searchAnswerSchema,
  searchSpeechAnswerSchema,
  type SearchAnswer,
} from "../../shared/search.ts";
import type { Db } from "../db/database.ts";
import type { FlagValues } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import type { SarvamTransport } from "../sarvam/api.ts";
import { wavBytes } from "../reading/test-wav.ts";
import { createTestApp } from "../test-app.ts";
import { seedStore } from "../test-store.ts";

const saturday = 64;
const sunday = 1;

// A store shows in the tabs only with her FSSAI number.
function list(db: Db, ...storeIds: string[]) {
  const give = db.prepare("UPDATE stores SET fssai = ? WHERE id = ?");
  for (const id of storeIds) give.run("10012345678901", id);
}

function setup({
  flagValues = {},
  sarvam,
}: { flagValues?: Partial<FlagValues>; sarvam?: SarvamTransport } = {}) {
  const test = createTestApp({
    flags: createDefaultFlags(flagValues),
    ...(sarvam === undefined ? {} : { sarvam }),
  });
  const { db } = test.deps;
  const shobha = seedStore(db);
  db.prepare("UPDATE items SET name = ?, name_latin = ? WHERE id = ?").run(
    "ಕಾಜು ಕಟ್ಲಿ",
    "Kaju katli",
    shobha.items.kajuKatli.id,
  );
  const ghar = seedStore(db, {
    slug: "ghar-ki-mithai",
    name: "Ghar Ki Mithai",
    phone: "+919800000002",
  });
  db.prepare(
    "UPDATE stores SET area = 'HSR Layout', lat = 12.9116, lng = 77.6474 WHERE id = ?",
  ).run(ghar.storeId);
  const paused = seedStore(db, {
    slug: "paused-kitchen",
    name: "Paused Kitchen",
    phone: "+919800000003",
    paused: true,
  });
  const hidden = seedStore(db, {
    slug: "not-listed",
    name: "Not Listed",
    phone: "+919800000004",
  });
  db.prepare("UPDATE stores SET in_marketplace = 0 WHERE id = ?").run(
    hidden.storeId,
  );
  list(db, shobha.storeId, ghar.storeId, paused.storeId, hidden.storeId);
  const search = async (query: Record<string, string> = {}) => {
    const response = await test.app.request(
      `/api/search?${new URLSearchParams(query)}`,
    );
    return response;
  };
  const answer = async (query: Record<string, string> = {}) => {
    const response = await search(query);
    const text = await response.text();
    assert.equal(response.status, 200, text);
    return { answer: searchAnswerSchema.parse(JSON.parse(text)), text };
  };
  return { ...test, db, shobha, ghar, paused, search, answer };
}

const slugs = (answer: SearchAnswer) => answer.stores.map(({ slug }) => slug);
const dishes = (answer: SearchAnswer) =>
  answer.stores.map((store) => [store.slug, store.dishes.map(({ id }) => id)]);
// The dish that matched: it comes first on each card.
const matched = (answer: SearchAnswer) =>
  answer.stores.map((store) => [store.slug, store.dishes[0]?.id]);

test("with no words, the search lists the cooks of the marketplace with their dishes and next day", async () => {
  const { answer } = setup();
  const { answer: all } = await answer();
  assert.equal(all.match, "all");
  assert.equal(all.today, "2026-11-24");
  assert.equal(all.sort, "rating");
  assert.equal(all.located, false);
  assert.deepEqual(slugs(all), [
    "ghar-ki-mithai",
    "shobhas-kitchen",
    "paused-kitchen",
  ]);
  const [first] = all.stores;
  assert.equal(first?.next_free_day, "2026-11-24");
  assert.equal(first?.taking_orders, true);
  assert.equal(first?.distance_km, null);
  assert.equal(first?.dishes.length, 3);
  assert.equal(first?.dishes[0]?.pack?.price, 23000);
  assert.equal(first?.dishes[0]?.pack?.label, "250 g");
  assert.equal(first?.rating, null);
  const pausedStore = all.stores.at(-1);
  assert.equal(pausedStore?.taking_orders, false);
  assert.equal(pausedStore?.next_free_day, null);
  assert.equal(all.voice, true);
  assert.equal(all.recorded, true);
});

test("“kaju katli”, “ಕಾಜು ಕಟ್ಲಿ” and “काजू कतली” give the same results", async () => {
  const latin: Record<string, string> = {
    "ಕಾಜು ಕಟ್ಲಿ": "Kaaju Katli",
    "काजू कतली": "kaajoo katlee",
  };
  const asked: string[] = [];
  const sarvam: SarvamTransport = {
    mode: "live",
    send: async (request) => {
      const text =
        typeof request.input === "string" ? latin[request.input] : undefined;
      if (request.api === "transliterate" && text !== undefined) {
        if (!(request.body instanceof FormData)) {
          asked.push(String(request.body.source_language_code));
        }
        return {
          ok: true,
          status: 200,
          body: { transliterated_text: text },
          placeholder: false,
        };
      }
      return {
        ok: false,
        outcome: "error",
        status: 500,
        code: null,
        missing: false,
      };
    },
  };
  const { answer, shobha, ghar, paused } = setup({ sarvam });
  const results = await Promise.all(
    ["kaju katli", "ಕಾಜು ಕಟ್ಲಿ", "काजू कतली"].map(
      async (q) => (await answer({ q })).answer,
    ),
  );
  const expected = [
    ["ghar-ki-mithai", ghar.items.kajuKatli.id],
    ["shobhas-kitchen", shobha.items.kajuKatli.id],
    ["paused-kitchen", paused.items.kajuKatli.id],
  ];
  for (const result of results) {
    assert.equal(result.match, "trigram");
    assert.deepEqual(matched(result), expected);
  }
  assert.equal(results[0]?.latin, null);
  assert.equal(results[1]?.latin, "Kaaju Katli");
  assert.equal(results[2]?.latin, "kaajoo katlee");
  assert.deepEqual(asked.sort(), ["hi-IN", "kn-IN"]);
});

test("a query in an Indian script with no saved Latin form matches the original names", async () => {
  const { answer, shobha, logs } = setup();
  const { answer: found } = await answer({ q: "ಕಾಜು" });
  assert.equal(found.match, "plain");
  assert.equal(found.latin, null);
  assert.deepEqual(matched(found), [
    ["shobhas-kitchen", shobha.items.kajuKatli.id],
  ]);
  const line = logs().find((entry) => entry.route === "/api/search");
  assert.deepEqual(line?.flags, { ops_search: "ai", search_match: "plain" });
});

test("ops_search plain matches a part of the original names, with no other rule", async () => {
  const { answer, shobha, ghar, paused } = setup({
    flagValues: { ops_search: "plain" },
  });
  const { answer: found } = await answer({ q: "Kaju Katli" });
  assert.equal(found.match, "plain");
  assert.deepEqual(matched(found), [
    ["ghar-ki-mithai", ghar.items.kajuKatli.id],
    ["shobhas-kitchen", shobha.items.kajuKatli.id],
    ["paused-kitchen", paused.items.kajuKatli.id],
  ]);
  const { answer: spelled } = await answer({ q: "kaaju" });
  assert.deepEqual(spelled.stores, []);
});

test("a query of one or two letters matches the start of a word", async () => {
  const { answer, shobha, ghar, paused } = setup();
  const { answer: found } = await answer({ q: "my" });
  assert.equal(found.match, "prefix");
  assert.deepEqual(matched(found), [
    ["ghar-ki-mithai", ghar.items.mysorePak.id],
    ["shobhas-kitchen", shobha.items.mysorePak.id],
    ["paused-kitchen", paused.items.mysorePak.id],
  ]);
});

test("a store name finds her store with her dishes", async () => {
  const { answer } = setup();
  const { answer: found } = await answer({ q: "Shobha's" });
  assert.deepEqual(slugs(found), ["shobhas-kitchen"]);
  assert.equal(found.stores[0]?.dishes.length, 3);
});

test("the veg filter and the category keep only those dishes", async () => {
  const { answer, db, ghar } = setup();
  db.prepare("UPDATE items SET veg_mark = 'egg' WHERE id = ?").run(
    ghar.items.chakkuli.id,
  );
  const { answer: egg } = await answer({ veg: "egg" });
  assert.deepEqual(dishes(egg), [["ghar-ki-mithai", [ghar.items.chakkuli.id]]]);
  const { answer: savouries } = await answer({
    category: "savouries",
    veg: "veg",
  });
  assert.deepEqual(slugs(savouries), ["shobhas-kitchen", "paused-kitchen"]);
});

test("Need it by keeps the cooks with space by then; with none, the nearest later days", async () => {
  const { answer, db, shobha, ghar } = setup();
  db.prepare("UPDATE stores SET working_days = ? WHERE id = ?").run(
    saturday,
    shobha.storeId,
  );
  const { answer: byWednesday } = await answer({ need_by: "2026-11-25" });
  assert.equal(byWednesday.need_by, "2026-11-25");
  assert.equal(byWednesday.need_by_met, true);
  assert.deepEqual(slugs(byWednesday), ["ghar-ki-mithai"]);

  db.prepare("UPDATE stores SET working_days = ? WHERE id = ?").run(
    sunday,
    ghar.storeId,
  );
  const { answer: later } = await answer({ need_by: "2026-11-25" });
  assert.equal(later.need_by_met, false);
  assert.deepEqual(
    later.stores.map(({ slug, next_free_day }) => [slug, next_free_day]),
    [
      ["shobhas-kitchen", "2026-11-28"],
      ["ghar-ki-mithai", "2026-11-29"],
    ],
  );
});

test("Need it by refuses a past day and a day after the 21-day window", async () => {
  const { search } = setup();
  const past = await search({ need_by: "2026-11-23" });
  assert.equal(past.status, 400);
  assert.equal(
    ((await past.json()) as { error: { code: string } }).error.code,
    "day_past",
  );
  const far = await search({ need_by: "2026-12-15" });
  assert.equal(far.status, 400);
  assert.equal(
    ((await far.json()) as { error: { code: string } }).error.code,
    "day_too_far",
  );
  const bad = await search({ lat: "12.9" });
  assert.equal(bad.status, 400);
});

test("with the buyer's location, the nearest cook comes first, in whole km, and no store location leaves the server", async () => {
  const { answer } = setup();
  const { answer: near, text } = await answer({
    lat: "12.9121",
    lng: "77.6446",
  });
  assert.equal(near.sort, "distance");
  assert.equal(near.located, true);
  assert.deepEqual(
    near.stores.map(({ slug, distance_km }) => [slug, distance_km]),
    [
      ["ghar-ki-mithai", 1],
      ["shobhas-kitchen", 8],
      ["paused-kitchen", 8],
    ],
  );
  assert.doesNotMatch(text, /"lat"|"lng"|12\.9417|77\.5755/);
  const { answer: rated } = await answer({
    lat: "12.9121",
    lng: "77.6446",
    sort: "rating",
  });
  assert.equal(rated.sort, "rating");
});

test("a city keeps only its cooks, by any of its names, and the answer names the city", async () => {
  const { answer, db } = setup();
  const bombay = seedStore(db, {
    slug: "bombay-bites",
    name: "Bombay Bites",
    phone: "+919800000005",
  });
  db.prepare(
    "UPDATE stores SET city = 'Mumbai', lat = 19.1197, lng = 72.8468 WHERE id = ?",
  ).run(bombay.storeId);
  list(db, bombay.storeId);
  const { answer: mumbai } = await answer({ city: "mumbai" });
  assert.equal(mumbai.city, "mumbai");
  assert.deepEqual(slugs(mumbai), ["bombay-bites"]);
  assert.deepEqual(slugs((await answer({ city: "Bombay" })).answer), [
    "bombay-bites",
  ]);
  const { answer: bengaluru } = await answer({ city: "ಬೆಂಗಳೂರು" });
  assert.equal(bengaluru.city, "bengaluru");
  assert.deepEqual(slugs(bengaluru), [
    "ghar-ki-mithai",
    "shobhas-kitchen",
    "paused-kitchen",
  ]);
  assert.deepEqual(slugs((await answer({ city: "Udupi" })).answer), []);
  const { answer: every } = await answer();
  assert.equal(every.city, null);
  assert.equal(every.stores.length, 4);
});

test("Nearest with no location measures from the centre of the city, and no store location leaves the server", async () => {
  const { answer } = setup();
  const { answer: near, text } = await answer({
    city: "bengaluru",
    sort: "distance",
  });
  assert.equal(near.sort, "distance");
  assert.equal(near.located, false);
  assert.equal(near.distance_from, "centre");
  assert.deepEqual(
    near.stores.map(({ slug, distance_km }) => [slug, distance_km]),
    [
      ["shobhas-kitchen", 4],
      ["ghar-ki-mithai", 8],
      ["paused-kitchen", 4],
    ],
  );
  assert.doesNotMatch(text, /"lat"|"lng"|12\.9417|77\.5755|12\.9716/);

  const { answer: rated } = await answer({ city: "bengaluru" });
  assert.equal(rated.sort, "rating");
  assert.equal(rated.distance_from, null);
  assert.equal(rated.stores[0]?.distance_km, null);

  const noCentre: Record<string, string>[] = [
    { sort: "distance" },
    { sort: "distance", city: "Udupi" },
  ];
  for (const query of noCentre) {
    const { answer: none } = await answer(query);
    assert.equal(none.sort, "distance");
    assert.equal(none.distance_from, null);
    assert.ok(none.stores.every(({ distance_km }) => distance_km === null));
  }

  const { answer: located } = await answer({
    city: "bengaluru",
    sort: "distance",
    lat: "12.9121",
    lng: "77.6446",
  });
  assert.equal(located.distance_from, "buyer");
  assert.equal(located.stores[0]?.slug, "ghar-ki-mithai");
});

test("the answer has no Special row and no festival, and each cook has her rating or none", async () => {
  const { answer, db, shobha } = setup();
  db.prepare("UPDATE items SET special = 1 WHERE id = ?").run(
    shobha.items.mysorePak.id,
  );
  db.prepare(
    "UPDATE stores SET rating_average = 4.62, rating_count = 128 WHERE id = ?",
  ).run(shobha.storeId);
  const { answer: all, text } = await answer({ q: "kaju" });
  const raw = JSON.parse(text) as Record<string, unknown>;
  assert.equal("specials" in raw, false);
  assert.equal("festival" in raw, false);
  const rating = (slug: string) =>
    all.stores.find((store) => store.slug === slug)?.rating;
  assert.deepEqual(rating("shobhas-kitchen"), { average: 4.6, count: 128 });
  assert.equal(rating("ghar-ki-mithai"), null);
  assert.deepEqual(
    all.stores.find(({ slug }) => slug === "shobhas-kitchen")?.categories,
    ["sweets", "savouries"],
  );
});

test("Best rated puts the highest average first and the cooks with no rating after them, each by the next day with space", async () => {
  const { answer, db, shobha, ghar } = setup();
  const coastal = seedStore(db, {
    slug: "coastal-kitchen",
    name: "Coastal Kitchen",
    phone: "+919800000006",
  });
  list(db, coastal.storeId);
  const rate = db.prepare(
    "UPDATE stores SET rating_average = ?, rating_count = ? WHERE id = ?",
  );
  rate.run(4.2, 30, ghar.storeId);
  rate.run(4.8, 12, shobha.storeId);
  const { answer: rated } = await answer({ sort: "rating" });
  assert.deepEqual(slugs(rated), [
    "shobhas-kitchen",
    "ghar-ki-mithai",
    "coastal-kitchen",
    "paused-kitchen",
  ]);

  rate.run(4.8, 3, ghar.storeId);
  db.prepare("UPDATE stores SET working_days = ? WHERE id IN (?, ?)").run(
    saturday,
    shobha.storeId,
    coastal.storeId,
  );
  const { answer: tied } = await answer();
  assert.deepEqual(slugs(tied), [
    "ghar-ki-mithai",
    "shobhas-kitchen",
    "coastal-kitchen",
    "paused-kitchen",
  ]);
});

test("a marketplace store without her FSSAI number is not found; her own link still works", async () => {
  const { answer, app, db } = setup();
  const noNumber = seedStore(db, {
    slug: "no-fssai-kitchen",
    name: "No Fssai Kitchen",
    phone: "+919800000007",
  });
  assert.equal(
    slugs((await answer({ q: "No Fssai" })).answer).includes(
      "no-fssai-kitchen",
    ),
    false,
  );
  assert.equal(
    slugs((await answer()).answer).includes("no-fssai-kitchen"),
    false,
  );
  list(db, noNumber.storeId);
  assert.deepEqual(slugs((await answer({ q: "No Fssai" })).answer), [
    "no-fssai-kitchen",
  ]);
  db.prepare("UPDATE stores SET fssai = NULL WHERE id = ?").run(
    noNumber.storeId,
  );
  const own = await app.request("/api/stores/no-fssai-kitchen");
  assert.equal(own.status, 200, await own.clone().text());
});

test("a voice search gives the transcript of the saved answer", async () => {
  const { app } = setup();
  const audio = readFileSync(
    new URL("../../fixtures/sarvam/audio/synthetic-VK1.wav", import.meta.url),
  );
  const response = await app.request("/api/search/speech", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: audio,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const answer = searchSpeechAnswerSchema.parse(await response.json());
  assert.notEqual(answer.transcript, "");
  assert.equal(answer.language, "kn-IN");
  assert.equal(answer.recorded, true);
});

test("a voice search refuses what is not a WAV voice part, and stops when voice is off", async () => {
  const { app } = setup();
  const notWav = await app.request("/api/search/speech", {
    method: "POST",
    headers: { "Content-Type": "audio/webm" },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(notWav.status, 415);
  const empty = await app.request("/api/search/speech", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(empty.status, 400);

  const off = setup({ flagValues: { ops_voice: false } });
  const audio = readFileSync(
    new URL("../../fixtures/sarvam/audio/synthetic-VK1.wav", import.meta.url),
  );
  const response = await off.app.request("/api/search/speech", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: audio,
  });
  assert.equal(response.status, 409);
  assert.equal(
    ((await response.json()) as { error: { code: string } }).error.code,
    "voice_off",
  );
  const { answer } = await off.answer();
  assert.equal(answer.voice, false);
});

test("in recorded mode, a voice search with no saved answer is a 4xx that asks for typing, not an outage", async () => {
  const { app } = setup();
  const response = await app.request("/api/search/speech", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wavBytes(1.2),
  });
  assert.equal(response.status, 422);
  assert.equal(
    ((await response.json()) as { error: { code: string } }).error.code,
    "recording_missing",
  );
});

test("the demo search in three scripts finds the same cooks with the saved answers", async () => {
  const { answer } = setup();
  const results = await Promise.all(
    ["kaju katli", "ಕಾಜು ಕಟ್ಲಿ", "काजू कतली"].map(
      async (q) => (await answer({ q })).answer,
    ),
  );
  const [latin, ...others] = results.map(dishes);
  assert.ok((latin?.length ?? 0) >= 2);
  for (const found of others) assert.deepEqual(found, latin);
  assert.deepEqual(
    results.map(({ match }) => match),
    ["trigram", "trigram", "trigram"],
  );
});
