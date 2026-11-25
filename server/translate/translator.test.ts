import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/database.ts";
import type { FlagValues } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { createLog } from "../log.ts";
import { createMetrics } from "../metrics/metrics.ts";
import type {
  SarvamAnswer,
  SarvamRequest,
  SarvamTransport,
} from "../sarvam/api.ts";
import { createTestClock } from "../test-app.ts";
import { failureRetryMs } from "./translation-cache.ts";
import {
  createTranslator,
  latinSource,
  needsTranslation,
  translateKey,
} from "./translator.ts";

type Handler = (request: SarvamRequest) => SarvamAnswer | Promise<SarvamAnswer>;

const ok = (body: unknown, placeholder = false): SarvamAnswer => ({
  ok: true,
  status: 200,
  body,
  placeholder,
});

const failed: SarvamAnswer = {
  ok: false,
  outcome: "error",
  status: 500,
  code: null,
  missing: false,
};

const echo: Handler = (request) =>
  request.api === "translate"
    ? ok({
        translated_text: `${String(request.settings?.target_language_code)}: ${String(request.input)}`,
      })
    : ok({
        transliterated_text: `${String(request.settings?.target_language_code)}: ${String(request.input)}`,
      });

function setup(
  handler: Handler = echo,
  flags: Partial<FlagValues> = {},
  mode: SarvamTransport["mode"] = "live",
) {
  const requests: SarvamRequest[] = [];
  const clock = createTestClock();
  const db = openDatabase(":memory:");
  const lines: string[] = [];
  const sarvam: SarvamTransport = {
    mode,
    send: async (request) => {
      requests.push(request);
      return handler(request);
    },
  };
  const translator = createTranslator({
    db,
    clock,
    sarvam,
    metrics: createMetrics(),
    flags: createDefaultFlags(flags),
    log: createLog((line) => lines.push(line), clock),
    stopping: new AbortController().signal,
  });
  return { translator, requests, clock, db, lines };
}

const hindiNote = "कम मीठा रखिए";

test("a text needs translation when its language or script is not the reader's", () => {
  assert.equal(needsTranslation(hindiNote, "kn", null), true);
  assert.equal(needsTranslation("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", "kn", null), false);
  assert.equal(needsTranslation("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", "kn", "kn-IN"), false);
  assert.equal(needsTranslation("ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", "en", "kn-IN"), true);
  assert.equal(needsTranslation("less sugar", "en", null), false);
  assert.equal(needsTranslation("less sugar", "hi", "en"), true);
  assert.equal(needsTranslation("कमी साखर", "hi", "mr-IN"), true);
  assert.equal(needsTranslation("   ", "kn", null), false);
});

test("the cache key names the source, or auto when it is not known", () => {
  const cfg = { translation_model: "mayura:v1" };
  assert.deepEqual(translateKey(` ${hindiNote} `, "kn", null, cfg), {
    kind: "translate",
    model: "mayura:v1",
    source: "auto",
    target: "kn-IN",
    text: hindiNote,
  });
  assert.equal(translateKey(hindiNote, "kn", "hi", cfg).source, "hi-IN");
  assert.equal(translateKey(hindiNote, "kn", "bn-IN", cfg).source, "bn-IN");
});

test("an item name comes from its Latin form, unless it is in the reader's script", () => {
  const item = { id: "1", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" };
  assert.equal(latinSource(item, "hi"), "Mysore pak");
  assert.equal(latinSource(item, "kn"), undefined);
  assert.equal(latinSource({ ...item, name_latin: null }, "hi"), undefined);
  assert.equal(latinSource({ ...item, name_latin: "ಪಾಕ್" }, "hi"), undefined);
  const latin = { id: "2", name: "Kaju katli", name_latin: "Kaju katli" };
  assert.equal(latinSource(latin, "en"), undefined);
  assert.equal(latinSource(latin, "ta"), "Kaju katli");
});

test("translate calls mayura once, then answers from the cache", async () => {
  const { translator, requests } = setup();
  const first = await translator.translate(hindiNote, "kn");
  assert.deepEqual(first, { text: `kn-IN: ${hindiNote}`, language: "kn" });
  assert.deepEqual(requests[0]?.body, {
    input: hindiNote,
    source_language_code: "auto",
    target_language_code: "kn-IN",
    model: "mayura:v1",
    mode: "modern-colloquial",
  });
  assert.deepEqual(requests[0]?.settings, { target_language_code: "kn-IN" });
  assert.deepEqual(await translator.translate(hindiNote, "kn"), first);
  assert.equal(requests.length, 1);
  assert.equal(await translator.translate(hindiNote, "hi"), null);
  assert.equal(await translator.translate(null, "kn"), null);
  assert.equal(requests.length, 1);
});

test("translate splits a long text at sentence ends, 1,000 characters at most", async () => {
  const { translator, requests } = setup();
  const sentence = `${"ಸ".repeat(590)}. `;
  await translator.translate(`${sentence}${sentence}`, "en");
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ input }) => String(input).length <= 1000));
});

test("concurrent reads share one call", async () => {
  const { translator, requests } = setup();
  await Promise.all([
    translator.translate(hindiNote, "kn"),
    translator.translate(hindiNote, "kn"),
  ]);
  assert.equal(requests.length, 1);
});

test("ops_translation off gives the original only, with no call", async () => {
  const { translator, requests } = setup(echo, { ops_translation: "off" });
  assert.equal(await translator.translate(hindiNote, "kn"), null);
  assert.equal(requests.length, 0);
});

test("a placeholder answer shows, but is not cached", async () => {
  const { translator, requests, db } = setup((request) => ({
    ...(echo(request) as SarvamAnswer & { ok: true }),
    placeholder: true,
  }));
  assert.ok(await translator.translate(hindiNote, "kn"));
  assert.ok(await translator.translate(hindiNote, "kn"));
  assert.equal(requests.length, 2);
  assert.equal(
    db.prepare("SELECT count(*) FROM translations").pluck().get(),
    0,
  );
});

test("an answer equal to the original is no translation", async () => {
  const { translator } = setup(() => ok({ translated_text: ` ${hindiNote}` }));
  assert.equal(await translator.translate(hindiNote, "kn"), null);
});

test("a failed key waits five minutes before its next call", async () => {
  const { translator, requests, clock, lines } = setup(() => failed);
  assert.equal(await translator.translate(hindiNote, "kn"), null);
  assert.equal(await translator.translate(hindiNote, "kn"), null);
  assert.equal(requests.length, 1);
  assert.match(lines[0] ?? "", /a Sarvam call failed/);
  clock.advance(failureRetryMs);
  await translator.translate(hindiNote, "kn");
  assert.equal(requests.length, 2);
});

test("a slow call gives null after waitMs, then fills the cache", async () => {
  let answer: (value: SarvamAnswer) => void = () => {};
  const { translator, requests } = setup(
    () => new Promise((resolve) => (answer = resolve)),
  );
  assert.equal(
    await translator.translate(hindiNote, "kn", { waitMs: 5 }),
    null,
  );
  answer(ok({ translated_text: "ಕಡಿಮೆ ಸಿಹಿ" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await translator.translate(hindiNote, "kn"), {
    text: "ಕಡಿಮೆ ಸಿಹಿ",
    language: "kn",
  });
  assert.equal(requests.length, 1);
});

test("an aborted read gives null at once", async () => {
  const { translator } = setup(() => new Promise(() => {}));
  const controller = new AbortController();
  const read = translator.translate(hindiNote, "kn", {
    signal: controller.signal,
  });
  controller.abort();
  assert.equal(await read, null);
});

test("cached answers from the cache only, and a miss calls onReady later", async () => {
  const { translator, requests } = setup();
  const ready: unknown[] = [];
  assert.equal(
    translator.cached(hindiNote, "kn", { onReady: (t) => ready.push(t) }),
    null,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ready, [{ text: `kn-IN: ${hindiNote}`, language: "kn" }]);
  assert.deepEqual(translator.cached(hindiNote, "kn"), ready[0]);
  assert.equal(requests.length, 1);
  assert.equal(translator.cached("ಸಕ್ಕರೆ", "kn"), null);
});

test("cached follows ops_translation off after its next flag check", async () => {
  const { translator, requests } = setup(echo, { ops_translation: "off" });
  translator.cached(hindiNote, "kn");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(translator.cached(hindiNote, "kn"), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1);
});

test("scriptNames transliterates the Latin forms into the buyer's script", async () => {
  const { translator, requests } = setup();
  const items = [
    { id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" },
    { id: "b", name: "Kaju katli", name_latin: "Kaju katli" },
    { id: "c", name: "ಚಕ್ಕುಲಿ", name_latin: null },
  ];
  const hindi = await translator.scriptNames(items, "hi");
  assert.deepEqual(Object.fromEntries(hindi), {
    a: "hi-IN: Mysore pak",
    b: "hi-IN: Kaju katli",
  });
  assert.deepEqual(requests[0]?.body, {
    input: "Mysore pak",
    source_language_code: "en-IN",
    target_language_code: "hi-IN",
  });
  assert.deepEqual(
    Object.fromEntries(await translator.scriptNames(items, "kn")),
    { b: "kn-IN: Kaju katli" },
  );
  assert.deepEqual(
    Object.fromEntries(await translator.scriptNames(items, "en")),
    { a: "Mysore pak" },
  );
  await translator.scriptNames(items, "hi");
  assert.equal(requests.length, 3);
});

test("scriptNames gives no names when ops_transliteration is off", async () => {
  const { translator, requests } = setup(echo, { ops_transliteration: "off" });
  const items = [{ id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" }];
  assert.equal((await translator.scriptNames(items, "hi")).size, 0);
  assert.equal((await translator.scriptNames(items, "en")).size, 0);
  assert.equal(requests.length, 0);
});

test("knownNames gives at once the names that an earlier call found, placeholders too", async () => {
  const { translator, requests } = setup((request) =>
    ok(
      {
        transliterated_text: `${String(request.settings?.target_language_code)}: ${String(request.input)}`,
      },
      true,
    ),
  );
  const items = [
    { id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" },
    { id: "b", name: "ಚಕ್ಕುಲಿ", name_latin: "Chakkuli" },
  ];
  await translator.scriptNames(items.slice(0, 1), "hi");
  assert.deepEqual(Object.fromEntries(translator.knownNames(items, "hi")), {
    a: "hi-IN: Mysore pak",
  });
  assert.equal(requests.length, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Object.fromEntries(translator.knownNames(items, "hi")), {
    a: "hi-IN: Mysore pak",
    b: "hi-IN: Chakkuli",
  });
  assert.deepEqual(Object.fromEntries(translator.knownNames(items, "en")), {
    a: "Mysore pak",
    b: "Chakkuli",
  });
  assert.equal(translator.knownNames(items, "kn").size, 0);
  assert.equal(requests.length, 2);
});

test("knownNames gives no names when ops_transliteration is off", async () => {
  const { translator, requests } = setup(echo, { ops_transliteration: "off" });
  const items = [{ id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: "Mysore pak" }];
  await translator.scriptNames(items, "hi");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(translator.knownNames(items, "hi").size, 0);
  assert.equal(translator.knownNames(items, "en").size, 0);
  assert.equal(requests.length, 0);
});

test("latinNames gives each name in an Indian script with no Latin form one, once", async () => {
  const { translator, requests } = setup();
  const items = [
    { id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: null },
    { id: "b", name: "ಚಕ್ಕುಲಿ", name_latin: "Chakkuli" },
    { id: "c", name: "Kaju katli", name_latin: null },
    { id: "d", name: "काजू कतली", name_latin: null },
  ];
  assert.deepEqual(Object.fromEntries(await translator.latinNames(items)), {
    a: "en-IN: ಮೈಸೂರು ಪಾಕ್",
    d: "en-IN: काजू कतली",
  });
  assert.deepEqual(
    requests.map(({ body }) => body),
    [
      {
        input: "ಮೈಸೂರು ಪಾಕ್",
        source_language_code: "kn-IN",
        target_language_code: "en-IN",
      },
      {
        input: "काजू कतली",
        source_language_code: "hi-IN",
        target_language_code: "en-IN",
      },
    ],
  );
  await translator.latinNames(items);
  assert.equal(requests.length, 2);
});

test("latinNames gives none when ops_transliteration is off, or for a placeholder or a failure", async () => {
  const items = [{ id: "a", name: "ಮೈಸೂರು ಪಾಕ್", name_latin: null }];
  const off = setup(echo, { ops_transliteration: "off" });
  assert.equal((await off.translator.latinNames(items)).size, 0);
  assert.equal(off.requests.length, 0);
  for (const handler of [
    () => ok({ transliterated_text: "Mysore pak" }, true),
    () => failed,
  ]) {
    const { translator, requests } = setup(handler);
    assert.equal((await translator.latinNames(items)).size, 0);
    assert.equal(requests.length, 1);
  }
});
