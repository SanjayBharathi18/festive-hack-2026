import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  itemReadAnswerSchema,
  partAnswerSchema,
  sellReadStateSchema,
} from "../../shared/reading.ts";
import type { AppDeps } from "../app.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { counterValue } from "../sarvam/fake-sarvam.ts";
import { fixturesDir } from "../sarvam/recorded.ts";
import { createTestApp } from "../test-app.ts";
import { wavBytes } from "./test-wav.ts";

type Line = { id: string; text: string };

const setupLines = JSON.parse(
  readFileSync(new URL("setup-lines.json", fixturesDir), "utf8"),
) as Line[];

function setupLine(id: string): string {
  const found = setupLines.find((line) => line.id === id);
  if (found === undefined) throw new Error(`No setup line ${id}.`);
  return found.text;
}

function audio(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL(`audio/${name}`, fixturesDir)));
}

function setup(overrides: Partial<AppDeps> = {}) {
  const testApp = createTestApp(overrides);
  const post = (path: string, body: RequestInit["body"], type: string) =>
    testApp.app.request(path, {
      method: "POST",
      headers: { "Content-Type": type, "Idempotency-Key": randomUUID() },
      body,
    });
  const sendPart = (bytes: Uint8Array<ArrayBuffer>) =>
    post("/api/sell/read/parts", bytes, "audio/wav");
  const readItem = (value: unknown) =>
    post("/api/sell/items/read", JSON.stringify(value), "application/json");
  return { ...testApp, sendPart, readItem };
}

async function errorCode(response: Response): Promise<string> {
  return errorBodySchema.parse(await response.json()).error.code;
}

test("the page learns that item reading and voice are on, in recorded mode", async () => {
  const { app } = setup();
  const response = await app.request("/api/sell/read");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(sellReadStateSchema.parse(await response.json()), {
    reading: true,
    voice: true,
    recorded: true,
  });
});

test("a typed setup line reads into one item with the packs of its price, with no account", async () => {
  const { readItem, deps, logs } = setup();
  const response = await readItem({ text: ` ${setupLine("VS4")} ` });
  assert.equal(response.status, 200, await response.clone().text());
  const answer = itemReadAnswerSchema.parse(await response.json());
  assert.equal(answer.path, "ai");
  assert.equal(answer.outcome, "ok");
  assert.equal(answer.show_manual, false);
  assert.equal(answer.recorded, true);
  assert.equal(answer.placeholder, true);
  assert.deepEqual(answer.item, {
    name: "Kaju katli",
    name_latin: null,
    category: "sweets",
    veg_mark: "veg",
    price: { per: "kg", amount: 120_000 },
    packs: [
      { label: "250 g", grams: 250, pieces: null, price: 30_000 },
      { label: "500 g", grams: 500, pieces: null, price: 60_000 },
      { label: "1 kg", grams: 1000, pieces: null, price: 120_000 },
    ],
    allergens: ["nuts"],
  });
  assert.equal(
    await counterValue(deps.metrics.readingResults, {
      variant: "native",
      path: "ai",
      outcome: "ok",
    }),
    1,
  );
  const log = logs().find((entry) => entry.route === "/api/sell/items/read");
  assert.deepEqual(log?.flags, {
    ops_suggestions: "ai",
    ops_reading: "ai",
    sarvam: "placeholder",
  });
});

test("a Kannada line keeps its name and its Latin name, and a line with no item asks for the form", async () => {
  const { readItem } = setup();
  const chakkuli = itemReadAnswerSchema.parse(
    await (await readItem({ text: setupLine("VS2") })).json(),
  );
  assert.equal(chakkuli.item?.name, "ಚಕ್ಕುಲಿ");
  assert.equal(chakkuli.item?.name_latin, "Chakkuli");
  assert.deepEqual(
    chakkuli.item?.packs.map(({ price }) => price),
    [10_000, 20_000, 40_000],
  );
  const nothing = itemReadAnswerSchema.parse(
    await (await readItem({ text: setupLine("VS1") })).json(),
  );
  assert.equal(nothing.outcome, "ok");
  assert.equal(nothing.show_manual, true);
  assert.equal(nothing.item?.name, null);
});

test("a voice part with no session reads into the item, and parts of the desk do not count", async () => {
  const { sendPart, readItem } = setup();
  const upload = await sendPart(audio("synthetic-VS4.wav"));
  assert.equal(upload.status, 201, await upload.clone().text());
  const part = partAnswerSchema.parse(await upload.json());
  assert.equal(part.recorded, true);
  const response = await readItem({ part_ids: [part.part_id] });
  assert.equal(response.status, 200);
  const answer = itemReadAnswerSchema.parse(await response.json());
  assert.equal(answer.transcript, setupLine("VS4"));
  assert.equal(answer.language, "en-IN");
  assert.equal(answer.item?.name, "Kaju katli");
  const unknown = await readItem({ part_ids: [randomUUID()] });
  assert.equal(unknown.status, 410);
  assert.equal(await errorCode(unknown), "parts_expired");
});

test("a missing saved answer in recorded mode asks for the form with a 422, not an outage", async () => {
  const { sendPart, readItem, deps } = setup();
  const text = await readItem({ text: "Rava laddu, 500 a kilo" });
  assert.equal(text.status, 422);
  assert.equal(await errorCode(text), "recording_missing");
  const voice = await sendPart(wavBytes(1.2));
  assert.equal(voice.status, 422);
  assert.equal(await errorCode(voice), "recording_missing");
  assert.equal(
    await counterValue(deps.metrics.readingResults, {
      path: "ai",
      outcome: "error",
    }),
    1,
  );
});

test("with ops_suggestions off: no voice parts and no reading, the item form only", async () => {
  const { app, sendPart, readItem, deps } = setup({
    flags: createDefaultFlags({ ops_suggestions: "off" }),
  });
  const state = sellReadStateSchema.parse(
    await (await app.request("/api/sell/read")).json(),
  );
  assert.equal(state.reading, false);
  const upload = await sendPart(audio("synthetic-VS4.wav"));
  assert.equal(upload.status, 409);
  assert.equal(await errorCode(upload), "voice_off");
  const response = await readItem({ text: setupLine("VS4") });
  assert.equal(response.status, 200);
  const answer = itemReadAnswerSchema.parse(await response.json());
  assert.equal(answer.path, "manual");
  assert.equal(answer.show_manual, true);
  assert.equal(answer.item, null);
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, { api: "chat" }),
    0,
  );
});

test("with ops_voice off the page types items, and voice parts are refused", async () => {
  const { app, sendPart } = setup({
    flags: createDefaultFlags({ ops_voice: false }),
  });
  const state = sellReadStateSchema.parse(
    await (await app.request("/api/sell/read")).json(),
  );
  assert.deepEqual(state, { reading: true, voice: false, recorded: true });
  const upload = await sendPart(audio("synthetic-VS4.wav"));
  assert.equal(upload.status, 409);
  assert.equal(await errorCode(upload), "voice_off");
});

test("ops_reading safe reads items with the fixed setting", async () => {
  const { readItem } = setup({
    flags: createDefaultFlags({
      ops_reading: "safe",
      cfg_sarvam: {
        speech_model: "saaras:v4",
        speech_mode: "codemix",
        reading_model: "sarvam-105b",
        reasoning_effort: "medium",
        max_tokens: 256,
        translation_model: "mayura:v1",
      },
    }),
  });
  const answer = itemReadAnswerSchema.parse(
    await (await readItem({ text: setupLine("VS4") })).json(),
  );
  assert.equal(answer.path, "safe");
  assert.equal(answer.item?.name, "Kaju katli");
});

test("an item reading needs parts or text, not both", async () => {
  const { readItem } = setup();
  for (const body of [{}, { text: "Kaju katli", part_ids: [randomUUID()] }]) {
    const response = await readItem(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(await errorCode(response), "invalid_input");
  }
});
