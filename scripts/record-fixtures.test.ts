import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { wavBytes } from "../server/reading/test-wav.ts";
import {
  fixturesDir,
  inputHash,
  loadRecordings,
  type Recording,
} from "../server/sarvam/recorded.ts";
import {
  demoTexts,
  heroMenu,
  incidentSettings,
  mergeRecordings,
  readSetupLines,
  recordFixtures,
} from "./record-fixtures.ts";
import { readEntries } from "./usage-log.ts";

const env = {
  SARVAM_API_KEY: "sk_record_test",
  SARVAM_BASE_URL: "https://api.sarvam.test",
};
const reading = JSON.stringify({
  items: [
    {
      menu_name: "Mysore pak",
      said: "one kilo of Mysore pak",
      quantity: 1,
      unit: "kg",
      pack_grams: null,
      pack_pieces: null,
    },
  ],
  day: "saturday",
  date: null,
  buyer_name: "Priya",
  fulfilment: "delivery",
  address: "Jayanagar",
  note: null,
});

const itemReading = JSON.stringify({
  name: "Kaju katli",
  name_latin: null,
  category: "sweets",
  veg_mark: "veg",
  price_rupees: 1200,
  price_per: "kg",
  allergens: ["nuts"],
});

function copyOfFixtures() {
  const root = mkdtempSync(join(tmpdir(), "record-"));
  const dir = join(root, "sarvam");
  cpSync(new URL(".", fixturesDir), dir, { recursive: true });
  const recording = wavBytes(1.5);
  writeFileSync(join(dir, "audio", "VK1.wav"), recording);
  return {
    dir: pathToFileURL(`${dir}/`),
    usageLog: join(root, "usage.log"),
    recording,
  };
}

function fakeSarvam({ noCredit = false } = {}) {
  const requests: { path: string; body: unknown; audio?: Uint8Array }[] = [];
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.headers.get("api-subscription-key") !== env.SARVAM_API_KEY) {
      return Response.json(
        { error: { code: "invalid_api_key_error" } },
        { status: 403 },
      );
    }
    if (path === "/speech-to-text") {
      const form = await request.formData();
      const file = form.get("file") as File;
      requests.push({
        path,
        body: null,
        audio: new Uint8Array(await file.arrayBuffer()),
      });
      return Response.json({
        request_id: "s1",
        transcript: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಬೇಕು",
        language_code: "kn-IN",
        language_probability: 0.91,
      });
    }
    const body = (await request.json()) as Record<string, unknown>;
    requests.push({ path, body });
    if (noCredit) {
      return Response.json(
        {
          error: {
            code: "insufficient_quota_error",
            message: "No credits available.",
          },
        },
        { status: 402 },
      );
    }
    if (path === "/text-lid") {
      const text = String(body.input);
      const language = /[ಀ-೿]/.test(text)
        ? "kn-IN"
        : /[ऀ-ॿ]/.test(text)
          ? "hi-IN"
          : "en-IN";
      return Response.json({
        request_id: "l1",
        language_code: language,
        script_code: null,
      });
    }
    if (path === "/transliterate") {
      return Response.json({
        request_id: "x1",
        transliterated_text: `${String(body.target_language_code)} ${String(body.input)}`,
        source_language_code: "en-IN",
      });
    }
    if (path === "/translate") {
      return Response.json({
        request_id: "t1",
        translated_text: `English for ${inputHash(String(body.input)).slice(0, 8)}`,
        source_language_code: "kn-IN",
      });
    }
    const format = body.response_format as {
      json_schema?: { name?: string };
    };
    const content =
      format.json_schema?.name === "item_reading" ? itemReading : reading;
    const cut = body.max_tokens === 256;
    return Response.json({
      id: "c1",
      choices: [
        {
          index: 0,
          finish_reason: cut ? "length" : "stop",
          message: { role: "assistant", content: cut ? "" : content },
        },
      ],
      usage: {
        prompt_tokens: 900,
        completion_tokens: cut ? 256 : 80,
        total_tokens: 1000,
      },
    });
  }) as typeof fetch;
  return { send, requests, paths: () => requests.map(({ path }) => path) };
}

const now = () => Date.parse("2026-11-24T06:30:00Z");
const saved0 = (dir: URL) => loadRecordings(dir);

test("record-fixtures sends the voice lines and the recordings live, and saves the answers in place of the placeholders", async () => {
  const { dir, usageLog, recording } = copyOfFixtures();
  const sarvam = fakeSarvam();
  const printed: string[] = [];
  const summary = await recordFixtures({
    env,
    fetch: sarvam.send,
    dir,
    usageLog,
    now,
    lines: ["VK1", "VE3"],
    incident: true,
    print: (line) => printed.push(line),
  });
  assert.deepEqual(sarvam.paths(), [
    "/text-lid",
    "/v1/chat/completions",
    "/translate",
    "/v1/chat/completions",
    "/v1/chat/completions",
    "/translate",
    "/v1/chat/completions",
    "/speech-to-text",
    "/v1/chat/completions",
    "/translate",
    "/v1/chat/completions",
    "/text-lid",
    "/v1/chat/completions",
  ]);
  const speech = sarvam.requests.filter(
    ({ path }) => path === "/speech-to-text",
  );
  assert.deepEqual(
    speech.map(({ audio }) => inputHash(audio!)),
    [inputHash(recording)],
  );
  const incident = sarvam.requests.find(
    ({ body }) => (body as { max_tokens?: number } | null)?.max_tokens === 256,
  );
  assert.equal(
    (incident?.body as { reasoning_effort: string }).reasoning_effort,
    "medium",
  );
  assert.deepEqual(summary, { calls: 13, saved: 12, stopped: null });
  const cutOffEnglish = saved0(dir).filter(
    (entry) =>
      entry.line === "VK1" &&
      entry.when !== undefined &&
      entry.input.startsWith("English for"),
  );
  assert.equal(cutOffEnglish.length, 1);

  const saved = loadRecordings(dir);
  const vk1 = JSON.parse(
    readFileSync(new URL("voice-lines.json", dir), "utf8"),
  ).find(({ id }: { id: string }) => id === "VK1").text as string;
  const forText = saved.filter((entry) => entry.input === vk1);
  assert.ok(forText.length >= 4);
  assert.ok(
    forText.every(
      (entry) =>
        !entry.placeholder && entry.recorded_at === "2026-11-24T06:30:00.000Z",
    ),
  );
  assert.deepEqual(forText.find((entry) => entry.when !== undefined)?.when, {
    reasoning_effort: incidentSettings.reasoning_effort,
    max_tokens: 256,
  });
  assert.equal(
    saved.some(
      (entry) =>
        entry.line === "VK1" &&
        entry.placeholder &&
        entry.api !== "speech_to_text",
    ),
    false,
  );
  const audio = saved.find((entry) => entry.input === "audio/VK1.wav");
  assert.equal(audio?.input_sha256, inputHash(recording));
  assert.equal(audio?.placeholder, false);
  assert.ok(
    saved.some(
      (entry) => entry.input === "audio/synthetic-VK1.wav" && entry.placeholder,
    ),
  );
  assert.ok(saved.some((entry) => entry.line === "VH1" && entry.placeholder));

  const entries = await readEntries(usageLog);
  assert.equal(entries.length, 13);
  assert.ok(entries.every(({ script }) => script === "record-fixtures"));
  const log = readFileSync(usageLog, "utf8");
  assert.match(log, /^# calls: 13$/m);
  assert.match(log, /^# speech_to_text audio_seconds: 1\.5$/m);
  assert.match(log, /^# chat output_tokens: \d+$/m);
  assert.ok(printed.some((line) => line.startsWith("VK1: 11 calls")));
});

test("record-fixtures stops when Sarvam has no credit", async () => {
  const { dir, usageLog } = copyOfFixtures();
  const sarvam = fakeSarvam({ noCredit: true });
  const before = loadRecordings(dir);
  const summary = await recordFixtures({
    env,
    fetch: sarvam.send,
    dir,
    usageLog,
    now,
    lines: ["VH1", "VH2"],
  });
  assert.equal(summary.stopped, "no_credit");
  assert.equal(summary.saved, 0);
  assert.equal(
    sarvam.requests.filter(({ path }) => path === "/text-lid").length,
    1,
  );
  assert.equal((await readEntries(usageLog)).length, summary.calls);
  assert.deepEqual(
    loadRecordings(dir).filter(({ line }) => line === "VH1"),
    before.filter(({ line }) => line === "VH1"),
  );
});

test("a dry run lists the calls and sends nothing, and a run with no key stops first", async () => {
  const { dir, usageLog } = copyOfFixtures();
  const sarvam = fakeSarvam();
  const printed: string[] = [];
  const summary = await recordFixtures({
    env: {},
    fetch: sarvam.send,
    dir,
    usageLog,
    lines: ["VK1", "VE3"],
    incident: true,
    dryRun: true,
    print: (line) => printed.push(line),
  });
  assert.deepEqual(summary, { calls: 0, saved: 0, stopped: null });
  assert.equal(sarvam.requests.length, 0);
  assert.deepEqual(printed, [
    "VK1: language_id, chat, translate, chat, chat (incident), translate, chat (incident), speech_to_text (VK1.wav), chat, translate, chat",
    "VE3: language_id, chat",
    "13 live Sarvam calls. Nothing was sent.",
  ]);
  await assert.rejects(
    recordFixtures({ env: {}, fetch: sarvam.send, dir, usageLog }),
    /Set SARVAM_API_KEY in \.env first/,
  );
  assert.equal(sarvam.requests.length, 0);
});

test("new answers replace the answers with the same key, and old placeholders of a recorded line go", () => {
  const entry = (input: string, extra: Partial<Recording> = {}): Recording => ({
    api: "chat",
    model: "sarvam-105b",
    input_sha256: inputHash(input),
    input,
    line: "VK1",
    placeholder: true,
    response: {},
    ...extra,
  });
  const merged = mergeRecordings(
    [
      entry("line text"),
      entry("placeholder English"),
      entry("line text", { when: { max_tokens: 256 } }),
      entry("other line", { line: "VH1" }),
      entry("audio/synthetic-VK1.wav", { api: "speech_to_text" }),
    ],
    [entry("line text", { placeholder: false })],
    new Map([["VK1", "line text"]]),
  );
  assert.deepEqual(
    merged.map(
      ({ input, placeholder, when }) =>
        `${input} ${placeholder}${when ? " when" : ""}`,
    ),
    [
      "line text false",
      "line text true when",
      "other line true",
      "audio/synthetic-VK1.wav true",
    ],
  );
});

test("the hero menu comes from the demo seed", () => {
  const menu = heroMenu();
  assert.equal(menu.length, 8);
  assert.equal(menu[0]?.name_latin, "Mysore pak");
  assert.deepEqual(
    menu[0]?.packs.map(({ label }) => label),
    ["250 g", "500 g", "1 kg"],
  );
});

test("a usage.log that cannot be read stops the run before any live call", async () => {
  const { dir, usageLog } = copyOfFixtures();
  writeFileSync(usageLog, "# calls: 1\nnot a usage entry\n");
  const sarvam = fakeSarvam();
  await assert.rejects(
    recordFixtures({
      env,
      fetch: sarvam.send,
      dir,
      usageLog,
      now,
      lines: ["VE3"],
    }),
    /Line 2 of usage\.log/,
  );
  assert.equal(sarvam.requests.length, 0);
});

test("each call is in usage.log, and each line is saved, as soon as it is done", async () => {
  const { dir, usageLog } = copyOfFixtures();
  const sarvam = fakeSarvam();
  const texts = new Map(
    (
      JSON.parse(readFileSync(new URL("voice-lines.json", dir), "utf8")) as {
        id: string;
        text: string;
      }[]
    ).map(({ id, text }) => [id, text]),
  );
  const seen: { line: string; entries: number; saved: boolean }[] = [];
  await recordFixtures({
    env,
    fetch: sarvam.send,
    dir,
    usageLog,
    now,
    lines: ["VE3", "VH1"],
    print: (printed) => {
      const id = /^(V[KHEM]\d+): /.exec(printed)?.[1];
      if (id === undefined) return;
      seen.push({
        line: id,
        entries: readFileSync(usageLog, "utf8")
          .split("\n")
          .filter((entry) => entry.startsWith("{")).length,
        saved: loadRecordings(dir).some(
          (entry) =>
            entry.input === texts.get(id) &&
            entry.api === "chat" &&
            !entry.placeholder,
        ),
      });
    },
  });
  assert.deepEqual(seen, [
    { line: "VH1", entries: 4, saved: true },
    { line: "VE3", entries: 6, saved: true },
  ]);
});

test("the demo texts are the item names in each script, the seeded notes, the quote requests, the board post and the demo searches", () => {
  const texts = demoTexts();
  const has = (api: string, text: string, target: string) =>
    texts.some(
      (entry) =>
        entry.api === api && entry.text === text && entry.target === target,
    );
  assert.ok(has("transliterate", "Mysore pak", "hi-IN"));
  assert.ok(has("transliterate", "Mysore pak", "kn-IN"));
  assert.ok(has("transliterate", "Kodubale", "ta-IN"));
  assert.ok(!has("transliterate", "Kodubale", "kn-IN"));
  assert.deepEqual(
    texts
      .filter(
        (entry) => entry.api === "transliterate" && entry.target === "en-IN",
      )
      .map(({ text, source }) => [text, source]),
    [
      ["ಕಾಜು ಕಟ್ಲಿ", "kn-IN"],
      ["काजू कतली", "hi-IN"],
    ],
  );
  assert.ok(has("translate", "ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", "en-IN"));
  assert.ok(!has("translate", "ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ", "kn-IN"));
  assert.ok(has("translate", "हर डिब्बे पर हमारी कंपनी का नाम चाहिए।", "kn-IN"));
  assert.ok(has("translate", "Koramangala office", "kn-IN"));
  assert.ok(has("translate", "ಪ್ರತಿ ಡಬ್ಬದ ಜೊತೆ ಶುಭಾಶಯ ಪತ್ರ ಬೇಕು.", "hi-IN"));
  assert.ok(!has("translate", "ಪ್ರತಿ ಡಬ್ಬದ ಜೊತೆ ಶುಭಾಶಯ ಪತ್ರ ಬೇಕು.", "kn-IN"));
  assert.ok(has("translate", "A tech company in Whitefield", "kn-IN"));
  assert.equal(
    new Set(texts.map((entry) => JSON.stringify(entry))).size,
    texts.length,
  );
});

test("each demo text has a saved answer for its target", () => {
  const recordings = loadRecordings();
  for (const text of demoTexts()) {
    const saved = recordings.find(
      (recording) =>
        recording.api === text.api &&
        recording.input_sha256 === inputHash(text.text) &&
        (text.target === "en-IN"
          ? recording.when === undefined
          : recording.when?.target_language_code === text.target),
    );
    assert.ok(saved, `${text.api} ${text.text} ${text.target}`);
  }
});

test("--texts records the demo texts, each saved for its target language, and reads the setup lines as items", async () => {
  const { dir, usageLog } = copyOfFixtures();
  const sarvam = fakeSarvam();
  const printed: string[] = [];
  const summary = await recordFixtures({
    env,
    fetch: sarvam.send,
    dir,
    usageLog,
    texts: true,
    print: (line) => printed.push(line),
  });
  const texts = demoTexts();
  const setup = await readSetupLines(dir);
  assert.equal(summary.calls, texts.length + setup.length);
  assert.equal(summary.stopped, null);
  assert.ok(
    sarvam
      .paths()
      .every((path) =>
        ["/translate", "/transliterate", "/v1/chat/completions"].includes(path),
      ),
  );
  assert.equal(
    sarvam.paths().filter((path) => path === "/v1/chat/completions").length,
    setup.length,
  );
  const saved = loadRecordings(dir);
  const name = saved.find(
    (recording) =>
      recording.api === "transliterate" &&
      recording.input === "Mysore pak" &&
      recording.when?.target_language_code === "hi-IN",
  );
  assert.equal(name?.placeholder, false);
  assert.deepEqual(
    (name?.response as { transliterated_text: string }).transliterated_text,
    "hi-IN Mysore pak",
  );
  assert.equal(
    saved.filter(
      (recording) => recording.line === "demo" && recording.placeholder,
    ).length,
    0,
  );
  for (const line of setup) {
    const item = saved.find(
      (recording) =>
        recording.api === "chat" &&
        recording.input_sha256 === inputHash(line.text),
    );
    assert.equal(item?.placeholder, false, line.id);
    assert.equal(item?.line, line.id);
    assert.equal(item?.when, undefined);
  }
  const usage = await readEntries(usageLog);
  assert.equal(usage.length, texts.length + setup.length);
  assert.match(printed.join("\n"), /demo texts: \d+ calls/);
  assert.match(
    printed.join("\n"),
    new RegExp(`setup lines: ${setup.length} of ${setup.length} read as items`),
  );
});

test("each setup line has a saved item reading", async () => {
  const recordings = loadRecordings();
  for (const line of await readSetupLines()) {
    assert.ok(
      recordings.some(
        (recording) =>
          recording.api === "chat" &&
          recording.input_sha256 === inputHash(line.text),
      ),
      line.id,
    );
  }
});

test("a dry run with --texts lists the text calls", async () => {
  const { dir, usageLog } = copyOfFixtures();
  const sarvam = fakeSarvam();
  const printed: string[] = [];
  await recordFixtures({
    env: {},
    fetch: sarvam.send,
    dir,
    usageLog,
    texts: true,
    dryRun: true,
    print: (line) => printed.push(line),
  });
  assert.equal(sarvam.requests.length, 0);
  assert.ok(printed.includes("transliterate to hi-IN: Mysore pak"));
  assert.ok(printed.includes("VS4: chat (item)"));
  const setup = await readSetupLines(dir);
  assert.match(
    printed.at(-1) ?? "",
    new RegExp(`^${demoTexts().length + setup.length} live Sarvam calls`),
  );
});
