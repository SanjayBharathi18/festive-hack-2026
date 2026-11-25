import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  cartReadAnswerSchema,
  deskReadAnswerSchema,
  partAnswerSchema,
  type DeskReadAnswer,
} from "../../shared/reading.ts";
import type { AppDeps } from "../app.ts";
import { parseConfig } from "../config.ts";
import { seedDemo } from "../demo/seed.ts";
import { safeSarvam } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { counterValue } from "../sarvam/fake-sarvam.ts";
import {
  createRecordedTransport,
  fixturesDir,
  inputHash,
  savedRecordings,
} from "../sarvam/recorded.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { partTtlMs } from "./parts.ts";
import { wavBytes } from "./test-wav.ts";

type Line = { id: string; language: string; text: string };
type Post = {
  body?: RequestInit["body"];
  type?: string;
  key?: string | null;
  demo?: boolean;
  headers?: Record<string, string>;
};

const demoToken = "demo-desk-token-for-tests";
const lines = JSON.parse(
  readFileSync(new URL("voice-lines.json", fixturesDir), "utf8"),
) as Line[];
const incident = {
  ...safeSarvam,
  reasoning_effort: "medium" as const,
  max_tokens: 256,
};

function line(id: string): Line {
  const found = lines.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No voice line ${id}.`);
  return found;
}

function audio(name: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(readFileSync(new URL(`audio/${name}`, fixturesDir)));
}

function setup(overrides: Partial<AppDeps> = {}) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    DEMO_DESK_TOKEN: demoToken,
  });
  if (!parsed.ok) throw new Error("The test configuration is not valid.");
  const clock = createTestClock();
  const testApp = createTestApp({ config: parsed.config, clock, ...overrides });
  seedDemo(testApp.deps.db, clock);
  const post = (
    path: string,
    { body, type, key = randomUUID(), demo = true, headers = {} }: Post = {},
  ) =>
    testApp.app.request(path, {
      method: "POST",
      headers: {
        ...(type === undefined ? {} : { "Content-Type": type }),
        ...(key === null ? {} : { "Idempotency-Key": key }),
        ...(demo ? { "X-Demo-Token": demoToken } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
    });
  const readJson = (path: string, value: unknown, options: Post = {}) =>
    post(path, {
      body: JSON.stringify(value),
      type: "application/json",
      ...options,
    });
  const readDesk = async (value: unknown, options: Post = {}) => {
    const response = await readJson("/api/desk/read", value, options);
    assert.equal(response.status, 200, await response.clone().text());
    return deskReadAnswerSchema.parse(await response.json());
  };
  const sendPart = async (
    bytes: Uint8Array<ArrayBuffer>,
    options: Post = {},
  ) => {
    const response = await post("/api/desk/read/parts", {
      body: bytes,
      type: "audio/wav",
      ...options,
    });
    assert.equal(response.status, 201, await response.clone().text());
    return partAnswerSchema.parse(await response.json());
  };
  return { ...testApp, clock, post, readJson, readDesk, sendPart };
}

async function errorCode(response: Response): Promise<string> {
  return errorBodySchema.parse(await response.json()).error.code;
}

function packs(answer: DeskReadAnswer): string[] {
  return answer.draft.items.flatMap((item) =>
    item.packs.map(
      ({ label, quantity }) => `${item.name} ${quantity} × ${label}`,
    ),
  );
}

test("a pasted voice line reads in recorded mode into a draft, marked as recorded", async () => {
  const { readDesk, deps, logs, lines: logLines } = setup();
  const answer = await readDesk({ text: line("VK1").text });
  assert.equal(answer.recorded, true);
  assert.equal(answer.language, "kn-IN");
  assert.equal(answer.path, "ai");
  assert.equal(answer.variant, "native");
  assert.equal(answer.outcome, "ok");
  assert.equal(answer.show_manual, false);
  assert.equal(answer.transcript, line("VK1").text);
  assert.equal(answer.trace.segment, "lang_kn");
  assert.deepEqual(packs(answer), ["ಮೈಸೂರು ಪಾಕ್ 1 × 1 kg", "ಚಕ್ಕುಲಿ 1 × 500 g"]);
  assert.equal(answer.draft.day, "2026-11-28");
  assert.equal(answer.draft.fulfilment, "delivery");
  assert.equal(answer.draft.buyer_name, "ಪ್ರಿಯಾ");
  assert.equal(answer.draft.total, 88_000 + 21_000);
  assert.deepEqual(answer.draft.capacity, {
    day: "2026-11-28",
    fits: true,
    reason: null,
    space_left: 2_000,
    next_free_day: null,
  });
  const request = logs().find((entry) => entry.route === "/api/desk/read");
  assert.deepEqual(request?.flags, {
    ops_reading: "ai",
    exp_reading_path: "native",
    segment: "lang_kn",
    flags_from: "defaults",
    sarvam: "placeholder",
  });
  assert.equal(answer.placeholder, true);
  assert.equal(
    logLines.some(
      (entry) => entry.includes("ಮೈಸೂರು") || entry.includes("ಪ್ರಿಯಾ"),
    ),
    false,
  );
  assert.equal(
    await counterValue(deps.metrics.readingResults, {
      language: "kn-IN",
      variant: "native",
      path: "ai",
      outcome: "ok",
    }),
    1,
  );
});

test("each voice line reads into a full draft, with no item left over", async () => {
  const { readDesk, clock } = setup();
  for (const [index, { id, text, language }] of lines.entries()) {
    if (index === 10) clock.advance(60_000);
    const answer = await readDesk({ text, language });
    assert.equal(answer.outcome, "ok", id);
    assert.ok(answer.draft.items.length > 0, id);
    assert.deepEqual(answer.draft.unmatched, [], id);
  }
});

test("the drafts follow the pack rules of the voice lines", async () => {
  const { readDesk } = setup();
  const read = (id: string) =>
    readDesk({ text: line(id).text, language: line(id).language });
  assert.deepEqual(packs(await read("VK2")), ["ಕಾಜು ಕಟ್ಲಿ 2 × 1 kg"]);
  assert.deepEqual(packs(await read("VH4")), [
    "ಕೋಡುಬಳೆ 1 × 1 kg",
    "ಕೋಡುಬಳೆ 1 × 500 g",
  ]);
  assert.deepEqual(packs(await read("VH2")), ["ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್ 2 × 500 g"]);
  const near = await read("VE3");
  assert.deepEqual(packs(near), ["ಚಕ್ಕುಲಿ 1 × 250 g"]);
  assert.equal(near.draft.items[0]?.near_amount, true);
  assert.equal(near.draft.items[0]?.asked.quantity, 300);
});

test("a day that is too full warns with the next day with space", async () => {
  const { readDesk } = setup();
  const answer = await readDesk({ text: line("VM4").text, language: "kn-IN" });
  assert.equal(answer.draft.day, "2026-11-28");
  assert.deepEqual(answer.draft.capacity, {
    day: "2026-11-28",
    fits: false,
    reason: "not_enough_space",
    space_left: 2_000,
    next_free_day: "2026-11-29",
  });
});

test("the incident: with reasoning on and 256 tokens, Kannada readings are invalid, and others are not", async () => {
  const { readDesk, deps, logs } = setup({
    flags: createDefaultFlags({ cfg_sarvam: incident }),
  });
  const kannada = await readDesk({ text: line("VK1").text, language: "kn-IN" });
  assert.equal(kannada.outcome, "invalid");
  assert.equal(kannada.show_manual, true);
  assert.equal(kannada.transcript, line("VK1").text);
  assert.deepEqual(kannada.draft.items, []);
  const failed = logs().find((entry) => entry.msg === "a Sarvam call failed");
  assert.equal(failed?.reason, "finish_reason length");
  assert.equal(failed?.language, "kn-IN");
  const hindi = await readDesk({ text: line("VH1").text, language: "hi-IN" });
  assert.equal(hindi.outcome, "ok");
  assert.equal(
    await counterValue(deps.metrics.readingResults, {
      language: "kn-IN",
      outcome: "invalid",
    }),
    1,
  );
});

test("ops_reading safe recovers the incident with the fixed setting", async () => {
  const { readDesk } = setup({
    flags: createDefaultFlags({ ops_reading: "safe", cfg_sarvam: incident }),
  });
  const answer = await readDesk({ text: line("VK1").text, language: "kn-IN" });
  assert.equal(answer.path, "safe");
  assert.equal(answer.outcome, "ok");
  assert.equal(answer.draft.items.length, 2);
});

test("ops_reading manual gives the transcript and an empty draft", async () => {
  const { readDesk, deps } = setup({
    flags: createDefaultFlags({ ops_reading: "manual" }),
  });
  const answer = await readDesk({ text: line("VH6").text, language: "hi-IN" });
  assert.equal(answer.path, "manual");
  assert.equal(answer.show_manual, true);
  assert.equal(answer.variant, null);
  assert.equal(answer.transcript, line("VH6").text);
  assert.deepEqual(answer.draft.items, []);
  assert.match(answer.draft.order_id, /^[0-9a-f-]{36}$/);
  assert.equal(await counterValue(deps.metrics.sarvamRequests, {}), 0);
});

test("translate_first reads the saved English translation", async () => {
  const { readDesk } = setup({
    flags: createDefaultFlags({ exp_reading_path: "translate_first" }),
  });
  const answer = await readDesk({ text: line("VK4").text, language: "kn-IN" });
  assert.equal(answer.variant, "translate_first");
  assert.match(answer.translation ?? "", /besan laddu/);
  assert.equal(answer.draft.note, "Put a little less sugar.");
  assert.equal(answer.draft.items.length, 2);
});

test("a text with no saved answer shows the manual path", async () => {
  const { readDesk, logs } = setup();
  const answer = await readDesk({
    text: "ಐದು ಕೆಜಿ ಜಿಲೇಬಿ ಬೇಕು",
    language: "kn-IN",
  });
  assert.equal(answer.outcome, "error");
  assert.equal(answer.show_manual, true);
  assert.equal(answer.recorded, true);
  const failed = logs().find((entry) => entry.msg === "a Sarvam call failed");
  assert.equal(failed?.reason, "no saved answer");
});

test("the saved invalid answers show the manual path", async () => {
  const { readDesk } = setup();
  for (const text of ["TEST empty answer", "TEST cut-off answer"]) {
    const answer = await readDesk({ text, language: "en-IN" });
    assert.equal(answer.outcome, "invalid", text);
    assert.equal(answer.show_manual, true, text);
  }
});

test("a voice part gives its words and language, and a read of the part gives the draft", async () => {
  const { sendPart, readDesk, logs } = setup();
  const part = await sendPart(audio("synthetic-VK1.wav"));
  assert.equal(part.transcript, line("VK1").text);
  assert.equal(part.language, "kn-IN");
  assert.equal(part.language_probability, 0.97);
  assert.equal(part.seconds, 1.6);
  assert.equal(part.recorded, true);
  const upload = logs().find((entry) => entry.route === "/api/desk/read/parts");
  assert.deepEqual(upload?.flags, {
    ops_voice: "on",
    speech_mode: "codemix",
    sarvam: "placeholder",
  });
  assert.equal(part.placeholder, true);
  const answer = await readDesk({ part_ids: [part.part_id] });
  assert.equal(answer.language, "kn-IN");
  assert.deepEqual(packs(answer), ["ಮೈಸೂರು ಪಾಕ್ 1 × 1 kg", "ಚಕ್ಕುಲಿ 1 × 500 g"]);
});

test("parts join in order, and the language is the language of the longest part", async () => {
  const { sendPart, readDesk } = setup();
  const first = await sendPart(audio("synthetic-VM1-1.wav"));
  const second = await sendPart(audio("synthetic-VM1-2.wav"));
  assert.equal(second.language, "en-IN");
  const answer = await readDesk({ part_ids: [first.part_id, second.part_id] });
  assert.equal(answer.transcript, line("VM1").text);
  assert.equal(answer.language, "hi-IN");
  assert.deepEqual(packs(answer), ["ಕಾಜು ಕಟ್ಲಿ 2 × 1 kg", "ಚಕ್ಕುಲಿ 1 × 1 kg"]);
});

test("a buyer reads a cart by voice with no session, on the native path", async () => {
  const { post, readJson, deps } = setup({
    flags: createDefaultFlags({ exp_reading_path: "translate_first" }),
  });
  const upload = await post("/api/cart/read/parts?store=shobhas-kitchen", {
    body: audio("synthetic-VE3.wav"),
    type: "audio/wav",
    demo: false,
  });
  assert.equal(upload.status, 201);
  const part = partAnswerSchema.parse(await upload.json());
  const response = await readJson(
    "/api/cart/read",
    { store: "shobhas-kitchen", part_ids: [part.part_id], via: "market" },
    { demo: false },
  );
  assert.equal(response.status, 200);
  const answer = cartReadAnswerSchema.parse(await response.json());
  assert.equal(answer.variant, "native");
  assert.equal(answer.recorded, true);
  assert.equal(answer.cart.items[0]?.packs[0]?.label, "250 g");
  assert.equal(answer.cart.items[0]?.near_amount, true);
  assert.equal(answer.cart.day, "2026-11-25");
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, { api: "translate" }),
    0,
  );
});

test("the desk needs the seller session", async () => {
  const { post, readJson } = setup();
  const part = await post("/api/desk/read/parts", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
    demo: false,
  });
  assert.equal(part.status, 401);
  assert.equal(await errorCode(part), "not_signed_in");
  const read = await readJson("/api/desk/read", { text: "x" }, { demo: false });
  assert.equal(read.status, 401);
});

test("a seller session reads with the menu and the limit of her own store", async () => {
  const { app, readDesk, deps } = setup();
  const phone = "+919800000002";
  deps.db
    .prepare(
      "UPDATE sellers SET phone = ? WHERE id = (SELECT seller_id FROM stores WHERE slug = 'test-kitchen')",
    )
    .run(phone);
  const json = { "Content-Type": "application/json" };
  const started = await app.request("/api/verify/start", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ phone, purpose: "desk" }),
  });
  const { code } = (await started.json()) as { code: string };
  const checked = await app.request("/api/verify/check", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ phone, purpose: "desk", code }),
  });
  const cookie = checked.headers.get("Set-Cookie")?.split(";")[0] ?? "";
  assert.match(cookie, /desk_session=/);
  const answer = await readDesk(
    { text: line("VM4").text, language: "kn-IN" },
    { demo: false, headers: { Cookie: cookie } },
  );
  const store = deps.db
    .prepare(
      "SELECT stores.slug FROM items JOIN stores ON stores.id = items.store_id WHERE items.id = ?",
    )
    .pluck()
    .get(answer.draft.items[0]?.item_id);
  assert.equal(store, "test-kitchen");
  assert.equal(answer.draft.capacity?.fits, true);
});

test("a part that is not a WAV file, too long or too big is refused", async () => {
  const { post } = setup();
  const cases: [Post, number, string][] = [
    [
      { body: audio("synthetic-VK1.wav"), type: "text/plain" },
      415,
      "unsupported_media_type",
    ],
    [
      { body: new TextEncoder().encode("OggS opus audio"), type: "audio/wav" },
      400,
      "audio_invalid",
    ],
    [{ body: wavBytes(0), type: "audio/wav" }, 400, "audio_invalid"],
    [
      { body: wavBytes(30.5, { level: 0 }), type: "audio/wav" },
      400,
      "audio_invalid",
    ],
    [
      { body: wavBytes(32, { level: 0 }), type: "audio/wav" },
      413,
      "payload_too_large",
    ],
    [
      { body: audio("synthetic-VK1.wav"), type: "audio/wav", key: null },
      400,
      "idempotency_key_missing",
    ],
  ];
  for (const [options, status, code] of cases) {
    const response = await post("/api/desk/read/parts", options);
    assert.equal(response.status, status, code);
    assert.equal(await errorCode(response), code);
  }
});

test("a voice part with no saved answer asks for the manual path with a 4xx, not an outage", async () => {
  const { post } = setup();
  for (const path of [
    "/api/desk/read/parts",
    "/api/cart/read/parts?store=shobhas-kitchen",
  ]) {
    const response = await post(path, {
      body: wavBytes(1.2),
      type: "audio/wav",
    });
    assert.equal(response.status, 422, path);
    assert.equal(await errorCode(response), "recording_missing", path);
  }
});

test("with ops_voice off, voice parts are refused as a client error, not an outage", async () => {
  const { post, logs } = setup({
    flags: createDefaultFlags({ ops_voice: false }),
  });
  const response = await post("/api/desk/read/parts", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
  });
  assert.equal(response.status, 409);
  assert.equal(await errorCode(response), "voice_off");
  const upload = logs().find((entry) => entry.route === "/api/desk/read/parts");
  assert.deepEqual(upload?.flags, { ops_voice: "off", speech_mode: "codemix" });
  const cart = await post("/api/cart/read/parts?store=shobhas-kitchen", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
    demo: false,
  });
  assert.equal(cart.status, 409);
  assert.equal(await errorCode(cart), "voice_off");
});

test("a part with no words gets no reading", async () => {
  const silence = wavBytes(1, { level: 0 });
  const { sendPart, readJson } = setup({
    sarvam: createRecordedTransport([
      ...savedRecordings(),
      {
        api: "speech_to_text",
        model: "saaras:v4",
        input_sha256: inputHash(silence),
        input: "audio/silence.wav",
        placeholder: true,
        response: { request_id: null, transcript: "", language_code: null },
      },
    ]),
  });
  const part = await sendPart(silence);
  assert.equal(part.transcript, "");
  const response = await readJson("/api/desk/read", {
    part_ids: [part.part_id],
  });
  assert.equal(response.status, 422);
  assert.equal(await errorCode(response), "no_words");
});

test("expired parts, and parts of another reading, ask for the voice note again", async () => {
  const { sendPart, readJson, clock } = setup();
  const part = await sendPart(audio("synthetic-VK1.wav"));
  const asCart = await readJson(
    "/api/cart/read",
    { store: "shobhas-kitchen", part_ids: [part.part_id] },
    { demo: false },
  );
  assert.equal(asCart.status, 410);
  assert.equal(await errorCode(asCart), "parts_expired");
  clock.advance(partTtlMs);
  const late = await readJson("/api/desk/read", { part_ids: [part.part_id] });
  assert.equal(late.status, 410);
  assert.equal(await errorCode(late), "parts_expired");
});

test("a reading needs either parts or text, and a known store", async () => {
  const { readJson, post } = setup();
  const both = await readJson("/api/desk/read", {
    text: "x",
    part_ids: [randomUUID()],
  });
  assert.equal(both.status, 400);
  assert.equal(await errorCode(both), "invalid_input");
  const nowhere = await post("/api/cart/read/parts?store=nowhere", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
    demo: false,
  });
  assert.equal(nowhere.status, 404);
  const noStore = await post("/api/cart/read/parts", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
    demo: false,
  });
  assert.equal(noStore.status, 400);
  const cart = await readJson(
    "/api/cart/read",
    { store: "nowhere", part_ids: [randomUUID()] },
    { demo: false },
  );
  assert.equal(cart.status, 404);
});

test("a retry with the same key replays the reading, with no second Sarvam call", async () => {
  const { readJson, deps } = setup();
  const key = randomUUID();
  const body = { text: line("VE1").text, language: "en-IN" };
  const first = await readJson("/api/desk/read", body, { key });
  const again = await readJson("/api/desk/read", body, { key });
  assert.equal(again.headers.get("Idempotent-Replayed"), "true");
  const [one, two] = [
    deskReadAnswerSchema.parse(await first.json()),
    deskReadAnswerSchema.parse(await again.json()),
  ];
  assert.equal(two.draft.order_id, one.draft.order_id);
  assert.equal(
    await counterValue(deps.metrics.sarvamRequests, { api: "chat" }),
    1,
  );
});

test("readings are limited to 20 a minute", async () => {
  const { readJson } = setup({
    flags: createDefaultFlags({ ops_reading: "manual" }),
  });
  for (let index = 0; index < 20; index += 1) {
    const response = await readJson("/api/desk/read", {
      text: "x",
      language: "en-IN",
    });
    assert.equal(response.status, 200);
  }
  const limited = await readJson("/api/desk/read", {
    text: "x",
    language: "en-IN",
  });
  assert.equal(limited.status, 429);
  assert.equal(await errorCode(limited), "rate_limited");
});

test("a reading that the page cancels ends with 499 and frees its key for a retry", async () => {
  const { app, readJson } = setup();
  const key = randomUUID();
  const controller = new AbortController();
  controller.abort();
  const cancelled = await app.request("/api/desk/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "X-Demo-Token": demoToken,
    },
    body: JSON.stringify({ text: line("VE2").text, language: "en-IN" }),
    signal: controller.signal,
  });
  assert.equal(cancelled.status, 499);
  const retry = await readJson(
    "/api/desk/read",
    { text: line("VE2").text, language: "en-IN" },
    { key },
  );
  assert.equal(retry.status, 200);
});

test("a language that Sarvam does not support is refused before any label is made", async () => {
  const { readJson, deps } = setup();
  for (const language of ["zz-IN", "qqq-IN", "abc-IN"]) {
    const response = await readJson("/api/desk/read", { text: "x", language });
    assert.equal(response.status, 400, language);
    assert.equal(await errorCode(response), "invalid_input");
  }
  const metrics = await deps.metrics.registry.metrics();
  assert.equal(/language="(zz|qqq|abc)-IN"/.test(metrics), false);
});

test("each failed speech call maps to its answer, and asks for the manual path", async () => {
  const cases = [
    ["no_credit", 503],
    ["rate_limited", 503],
    ["timeout", 504],
    ["error", 502],
    ["invalid", 502],
  ] as const;
  for (const [outcome, status] of cases) {
    const { post } = setup({
      sarvam: {
        mode: "live",
        send: async () => ({
          ok: false,
          outcome,
          status: null,
          code: null,
          missing: false,
        }),
      },
    });
    const response = await post("/api/desk/read/parts", {
      body: audio("synthetic-VK1.wav"),
      type: "audio/wav",
    });
    assert.equal(response.status, status, outcome);
    const { error } = errorBodySchema.parse(await response.json());
    assert.equal(error.code, "speech_failed", outcome);
    assert.match(error.message, /type (or paste )?the order/i, outcome);
  }
});

test("a part shorter than 0.1 seconds is refused with no speech call", async () => {
  const { post, deps } = setup();
  const response = await post("/api/desk/read/parts", {
    body: wavBytes(0.05),
    type: "audio/wav",
  });
  assert.equal(response.status, 400);
  assert.equal(await errorCode(response), "audio_invalid");
  assert.equal(await counterValue(deps.metrics.sarvamRequests, {}), 0);
});

test("readings and parts are not kept on disk, and their keys last as long as the parts", async () => {
  const { sendPart, readDesk, post, clock, deps } = setup();
  const key = randomUUID();
  const part = await sendPart(audio("synthetic-VK1.wav"), { key });
  await readDesk({ part_ids: [part.part_id] });
  await readDesk({ text: line("VK1").text, language: "kn-IN" });
  assert.equal(
    deps.db.prepare("SELECT count(*) FROM idempotency_keys").pluck().get(),
    0,
  );
  clock.advance(partTtlMs);
  const again = await post("/api/desk/read/parts", {
    body: audio("synthetic-VK1.wav"),
    type: "audio/wav",
    key,
  });
  assert.equal(again.status, 201);
  assert.equal(again.headers.get("Idempotent-Replayed"), null);
  const fresh = partAnswerSchema.parse(await again.json());
  assert.notEqual(fresh.part_id, part.part_id);
  const answer = await readDesk({ part_ids: [fresh.part_id] });
  assert.equal(answer.outcome, "ok");
});

test("a key that comes again with another body is refused", async () => {
  const { readJson } = setup();
  const key = randomUUID();
  const first = await readJson(
    "/api/desk/read",
    { text: line("VE1").text, language: "en-IN" },
    { key },
  );
  assert.equal(first.status, 200);
  const reused = await readJson(
    "/api/desk/read",
    { text: line("VE2").text, language: "en-IN" },
    { key },
  );
  assert.equal(reused.status, 422);
  assert.equal(await errorCode(reused), "idempotency_key_reused");
});

test("the same key for another store is a request of its own, never a replay", async () => {
  const { post } = setup();
  const key = randomUUID();
  const send = (store: string) =>
    post(`/api/cart/read/parts?store=${store}`, {
      body: audio("synthetic-VE3.wav"),
      type: "audio/wav",
      key,
      demo: false,
    });
  const hero = await send("shobhas-kitchen");
  const test = await send("test-kitchen");
  assert.equal(hero.status, 201);
  assert.equal(test.status, 201);
  assert.equal(test.headers.get("Idempotent-Replayed"), null);
  const [one, two] = [
    partAnswerSchema.parse(await hero.json()),
    partAnswerSchema.parse(await test.json()),
  ];
  assert.notEqual(one.part_id, two.part_id);
});
