import { readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  appLanguageSchema,
  sarvamLanguageSchema,
  type AppLanguage,
} from "../shared/languages.ts";
import { sourceLanguage } from "../server/catalog/search-form.ts";
import { presentVariables, type Env } from "../server/config.ts";
import {
  demoFixtureUrl,
  readDemoFixture,
} from "../server/demo/demo-fixture.ts";
import { heroSlug, packsOf, stableId } from "../server/demo/seed.ts";
import {
  safeSarvam,
  type CfgSarvam,
  type FlagValues,
} from "../server/flags/decisions.ts";
import { createDefaultFlags } from "../server/flags/default-flags.ts";
import { createMetrics } from "../server/metrics/metrics.ts";
import { keyterms, type ReadingItem } from "../server/reading/menu.ts";
import { joinParts, type Heard, type Part } from "../server/reading/parts.ts";
import { readItem, readOrder } from "../server/reading/pipeline.ts";
import { readWav } from "../server/reading/wav.ts";
import {
  sarvamApis,
  type SarvamRequest,
  type SarvamTransport,
} from "../server/sarvam/api.ts";
import type { SarvamCall, SarvamDeps } from "../server/sarvam/call.ts";
import { createLiveTransport } from "../server/sarvam/live.ts";
import {
  fixturesDir,
  inputHash,
  loadRecordings,
  recordingFiles,
  summarizeRecordings,
  type Recording,
} from "../server/sarvam/recorded.ts";
import { speechToText } from "../server/sarvam/speech-to-text.ts";
import { translateText } from "../server/sarvam/translate.ts";
import { transliterate } from "../server/sarvam/transliterate.ts";
import {
  latinSource,
  needsTranslation,
  translateKey,
  translationMode,
} from "../server/translate/translator.ts";
import { appendUsage, readEntries, usageLogFile } from "./usage-log.ts";

export type RecordOptions = {
  env: Env;
  fetch?: typeof fetch;
  dir?: URL;
  demoFixture?: URL;
  usageLog?: URL | string;
  now?: () => number;
  lines?: readonly string[] | undefined;
  incident?: boolean;
  texts?: boolean;
  dryRun?: boolean;
  print?: (line: string) => void;
};

export type RecordSummary = {
  calls: number;
  saved: number;
  stopped: "no_credit" | null;
};

export type DemoText = {
  api: "translate" | "transliterate";
  text: string;
  source: string;
  target: string;
};

export const voiceLineSchema = z.object({
  id: z.string().regex(/^V[KHEM]\d+$/),
  language: sarvamLanguageSchema,
  text: z.string().min(1),
});
export type VoiceLine = z.infer<typeof voiceLineSchema>;

// The setup lines of docs/demo-data.md, read as items in seller setup.
export const setupLineSchema = z.object({
  id: z.string().regex(/^VS\d+$/),
  language: sarvamLanguageSchema,
  text: z.string().min(1),
});
export type SetupLine = z.infer<typeof setupLineSchema>;

export const incidentSettings: CfgSarvam = {
  ...safeSarvam,
  reasoning_effort: "medium",
  max_tokens: 256,
};

// The searches of the demo: one dish in three
// scripts. A query in an Indian script gets its Latin form first, so all
// three find the same cooks.
export const demoSearches = ["kaju katli", "ಕಾಜು ಕಟ್ಲಿ", "काजू कतली"];

const recordingFile = /^(V[KHEM]\d+)(?:-(\d+))?\.wav$/;

export async function recordFixtures({
  env,
  fetch: send = fetch,
  dir = fixturesDir,
  demoFixture = demoFixtureUrl,
  usageLog = usageLogFile,
  now = Date.now,
  lines: only,
  incident = false,
  texts = false,
  dryRun = false,
  print = () => {},
}: RecordOptions): Promise<RecordSummary> {
  const variables = presentVariables(env);
  const apiKey = variables.SARVAM_API_KEY;
  if (apiKey === undefined && !dryRun) {
    throw new Error(
      "Set SARVAM_API_KEY in .env first. This script makes live Sarvam calls, which use the credit. Add --dry-run to see the calls first.",
    );
  }
  const lines = texts
    ? []
    : (await readVoiceLines(dir)).filter(
        ({ id }) => only === undefined || only.includes(id),
      );
  const demo = texts ? demoTexts(demoFixture) : [];
  const setup = texts ? await readSetupLines(dir) : [];
  const recordings = await audioRecordings(dir);
  const menu = heroMenu(demoFixture);
  if (dryRun) {
    let total = 0;
    for (const line of lines) {
      const planned = plannedCalls(
        line,
        recordings.get(line.id) ?? [],
        incident,
      );
      total += planned.length;
      print(`${line.id}: ${planned.join(", ")}`);
    }
    for (const text of demo) {
      print(`${text.api} to ${text.target}: ${text.text}`);
    }
    for (const line of setup) print(`${line.id}: chat (item)`);
    total += demo.length + setup.length;
    print(`${total} live Sarvam calls. Nothing was sent.`);
    return { calls: 0, saved: 0, stopped: null };
  }

  await readEntries(usageLog);
  const captured: Recording[] = [];
  const audioNames = new Map<string, string>();
  const lineCalls: SarvamCall[] = [];
  let usage = Promise.resolve();
  let currentLine = "";
  const live = createLiveTransport({
    baseUrl: variables.SARVAM_BASE_URL ?? "https://api.sarvam.ai",
    apiKey: apiKey ?? "",
    fetch: send,
  });
  const sarvam: SarvamTransport = {
    mode: "live",
    send: async (request, signal) => {
      const answer = await live.send(request, signal);
      if (answer.ok) {
        captured.push(
          capture(request, answer.body, {
            line: currentLine,
            input:
              typeof request.input === "string"
                ? request.input
                : (audioNames.get(inputHash(request.input)) ?? "audio"),
            time: now(),
          }),
        );
      }
      return answer;
    },
  };
  const deps: SarvamDeps = {
    sarvam,
    metrics: createMetrics(),
    report: (call) => {
      lineCalls.push(call);
      usage = usage.then(() =>
        appendUsage(usageLog, {
          time: new Date(now()).toISOString(),
          script: "record-fixtures",
          api: call.api,
          model: call.model,
          result: call.outcome,
          units: call.units,
        }),
      );
    },
  };
  const read = (heard: Heard, flags: Partial<FlagValues>, identify = false) =>
    readOrder(
      { ...deps, flags: createDefaultFlags(flags), clock: { now } },
      {
        kind: "desk",
        store: { slug: heroSlug, is_demo: true },
        menu,
        source: "desk",
        heard,
        identify,
      },
    );
  const readBothWays = async (heard: Heard) => {
    await read(heard, {});
    if (heard.language !== "en-IN") {
      await read(heard, { exp_reading_path: "translate_first" });
    }
  };

  let total = 0;
  let saved = 0;
  let stopped: RecordSummary["stopped"] = null;
  for (const line of lines) {
    currentLine = line.id;
    const text: Heard = {
      transcript: line.text,
      language: null,
      placeholder: false,
    };
    const first = await read(text, {}, true);
    const known: Heard = { ...text, language: first.language ?? line.language };
    if (known.language !== "en-IN") {
      await read(known, { exp_reading_path: "translate_first" });
    }
    const textRecorded = lineCalls.every(({ outcome }) => outcome === "ok");
    if (incident && known.language === "kn-IN") {
      await read(known, { cfg_sarvam: incidentSettings });
      await read(known, {
        cfg_sarvam: incidentSettings,
        exp_reading_path: "translate_first",
      });
    }
    const parts: Part[] = [];
    for (const name of recordings.get(line.id) ?? []) {
      const audio = new Uint8Array(
        await readFile(new URL(`audio/${name}`, dir)),
      );
      const wav = readWav(audio);
      if (wav === undefined) {
        print(`${name} is not a WAV file, so it was skipped.`);
        continue;
      }
      audioNames.set(inputHash(audio), `audio/${name}`);
      const speech = await speechToText(deps, {
        audio,
        seconds: wav.seconds,
        model: safeSarvam.speech_model,
        mode: safeSarvam.speech_mode,
        keyterms: keyterms(menu),
      });
      if (speech.ok) {
        parts.push({
          id: name,
          storeId: heroSlug,
          kind: "desk",
          ...speech.value,
          seconds: wav.seconds,
          placeholder: false,
        });
      }
    }
    const heard = joinParts(parts);
    if (heard.transcript !== "") await readBothWays(heard);
    await usage;
    const fresh = captured.splice(0);
    saved += new Set(fresh.map(key)).size;
    await writeRecordings(
      dir,
      mergeRecordings(
        loadRecordings(dir),
        fresh,
        new Map(textRecorded ? [[line.id, line.text]] : []),
      ),
    );
    const done = lineCalls.splice(0);
    total += done.length;
    const failed = done.filter(({ outcome }) => outcome !== "ok");
    print(
      `${line.id}: ${done.length} calls${failed.length > 0 ? `, ${failed.length} failed (${failed.map(({ api, outcome }) => `${api} ${outcome}`).join(", ")})` : ""}`,
    );
    if (done.some(({ outcome }) => outcome === "no_credit")) {
      stopped = "no_credit";
      print("Sarvam has no credit left, so the recording stopped.");
      break;
    }
  }

  if (stopped === null && demo.length > 0) {
    currentLine = "demo";
    for (const text of demo) {
      const result =
        text.api === "transliterate"
          ? await transliterate(deps, text)
          : await translateText(deps, {
              ...text,
              model: safeSarvam.translation_model,
              mode: translationMode,
            });
      if (!result.ok && result.outcome === "no_credit") break;
    }
    await usage;
    const fresh = captured.splice(0);
    saved += new Set(fresh.map(key)).size;
    await writeRecordings(
      dir,
      mergeRecordings(loadRecordings(dir), fresh, new Map()),
    );
    const done = lineCalls.splice(0);
    total += done.length;
    const failed = done.filter(({ outcome }) => outcome !== "ok");
    print(
      `demo texts: ${done.length} calls${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
    );
    if (done.some(({ outcome }) => outcome === "no_credit")) {
      stopped = "no_credit";
      print("Sarvam has no credit left, so the recording stopped.");
    }
  }

  if (stopped === null && setup.length > 0) {
    const recordedTexts = new Map<string, string>();
    for (const line of setup) {
      currentLine = line.id;
      await readItem(deps, {
        heard: { transcript: line.text, language: null, placeholder: false },
        flags: {
          ops_suggestions: "ai",
          ops_reading: "ai",
          cfg_sarvam: safeSarvam,
        },
      });
      const done = lineCalls.splice(0);
      total += done.length;
      if (done.every(({ outcome }) => outcome === "ok")) {
        recordedTexts.set(line.id, line.text);
      }
      if (done.some(({ outcome }) => outcome === "no_credit")) {
        stopped = "no_credit";
        break;
      }
    }
    await usage;
    const fresh = captured.splice(0);
    saved += new Set(fresh.map(key)).size;
    await writeRecordings(
      dir,
      mergeRecordings(loadRecordings(dir), fresh, recordedTexts),
    );
    print(
      `setup lines: ${recordedTexts.size} of ${setup.length} read as items`,
    );
    if (stopped === "no_credit") {
      print("Sarvam has no credit left, so the recording stopped.");
    }
  }

  const summary = summarizeRecordings(loadRecordings(dir));
  print(
    `Saved ${saved} answers from ${total} calls. ${summary.placeholders} placeholders are left, and ${summary.test_only} answers are for tests only.`,
  );
  return { calls: total, saved, stopped };
}

export function mergeRecordings(
  existing: readonly Recording[],
  captured: readonly Recording[],
  recordedTexts: ReadonlyMap<string, string>,
): Recording[] {
  const fresh = new Map(
    captured.map((recording) => [key(recording), recording]),
  );
  const merged: Recording[] = [];
  for (const recording of existing) {
    const replacement = fresh.get(key(recording));
    if (replacement !== undefined) {
      merged.push(replacement);
      fresh.delete(key(recording));
    } else if (!isOrphan(recording, recordedTexts)) {
      merged.push(recording);
    }
  }
  return [...merged, ...fresh.values()];
}

// The demo texts that a page translates or shows in another script: the item
// names of each store in each script, the seeded order notes, the notes and
// places of the seeded quote requests, the demo board post with its
// interests (docs/demo-data.md), and the Latin form of each demo search.
export function demoTexts(url: URL = demoFixtureUrl): DemoText[] {
  const { stores, board_posts } = readDemoFixture(url);
  const texts = new Map<string, DemoText>();
  const add = (text: DemoText) =>
    texts.set(JSON.stringify([text.api, text.text, text.target]), text);
  const translation = (
    text: string,
    from: string | null,
    to: AppLanguage,
  ): void => {
    if (!needsTranslation(text, to, from)) return;
    const { source, target } = translateKey(text, to, from, safeSarvam);
    add({ api: "translate", text: text.trim(), source, target });
  };
  const languages = appLanguageSchema.options;
  const bySlug = new Map(stores.map((store) => [store.slug, store]));
  for (const store of stores) {
    const items = store.items ?? bySlug.get(store.menu_of ?? "")?.items ?? [];
    for (const item of items) {
      for (const language of languages) {
        if (language === "en") continue;
        const latin = latinSource(
          { id: item.key, name: item.name, name_latin: item.name_latin },
          language,
        );
        if (latin === undefined) continue;
        add({
          api: "transliterate",
          text: latin,
          source: "en-IN",
          target: `${language}-IN`,
        });
      }
    }
    for (const { note, note_language } of store.orders) {
      if (note === undefined) continue;
      for (const language of languages) {
        translation(note, note_language ?? null, language);
      }
    }
    for (const quote of store.quotes) {
      for (const text of [quote.note, quote.place]) {
        if (text === null) continue;
        for (const language of languages) {
          translation(text, quote.language, language);
        }
      }
    }
  }
  const sellerLanguages = new Set(stores.map(({ seller }) => seller.language));
  for (const post of board_posts) {
    for (const text of [
      post.description,
      ...post.items.map(({ name }) => name),
    ]) {
      for (const language of sellerLanguages) {
        translation(text, post.language, language);
      }
    }
    for (const { store, note } of post.interests) {
      const seller = bySlug.get(store)?.seller.language;
      if (note !== null && seller !== undefined) {
        translation(note, seller, post.language);
      }
    }
  }
  for (const query of demoSearches) {
    const source = sourceLanguage(query);
    if (source === null) continue;
    add({ api: "transliterate", text: query, source, target: "en-IN" });
  }
  return [...texts.values()];
}

export function heroMenu(url: URL = demoFixtureUrl): ReadingItem[] {
  const store = readDemoFixture(url).stores.find(
    ({ slug }) => slug === heroSlug,
  );
  if (store?.items === undefined) {
    throw new Error(`${url.pathname} has no menu for ${heroSlug}.`);
  }
  return store.items
    .filter((item) => item.in_menu)
    .map((item) => ({
      id: stableId("item", heroSlug, item.key),
      name: item.name,
      name_latin: item.name_latin,
      sold_out: false,
      packs: packsOf(item).map((pack) => ({
        ...pack,
        id: stableId("pack", heroSlug, item.key, pack.label),
      })),
    }));
}

export function plannedCalls(
  line: VoiceLine,
  audio: readonly string[],
  incident: boolean,
): string[] {
  const translated = line.language === "en-IN" ? [] : ["translate", "chat"];
  return [
    "language_id",
    "chat",
    ...translated,
    ...(incident && line.language === "kn-IN"
      ? ["chat (incident)", "translate", "chat (incident)"]
      : []),
    ...audio.map((name) => `speech_to_text (${name})`),
    ...(audio.length > 0 ? ["chat", ...translated] : []),
  ];
}

export async function readVoiceLines(
  dir: URL = fixturesDir,
): Promise<VoiceLine[]> {
  const file = new URL("voice-lines.json", dir);
  return z
    .array(voiceLineSchema)
    .parse(JSON.parse(await readFile(file, "utf8")));
}

export async function readSetupLines(
  dir: URL = fixturesDir,
): Promise<SetupLine[]> {
  const file = new URL("setup-lines.json", dir);
  return z
    .array(setupLineSchema)
    .parse(JSON.parse(await readFile(file, "utf8")));
}

async function audioRecordings(dir: URL): Promise<Map<string, string[]>> {
  const names = await readdir(new URL("audio/", dir)).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const files = names
    .map((name) => ({ name, match: recordingFile.exec(name) }))
    .filter(
      (entry): entry is { name: string; match: RegExpExecArray } =>
        entry.match !== null,
    )
    .sort(
      (a, b) =>
        Number(a.match[2] ?? 0) - Number(b.match[2] ?? 0) ||
        a.name.localeCompare(b.name),
    );
  const byLine = new Map<string, string[]>();
  for (const { name, match } of files) {
    const id = match[1] ?? "";
    byLine.set(id, [...(byLine.get(id) ?? []), name]);
  }
  return byLine;
}

async function writeRecordings(
  dir: URL,
  recordings: readonly Recording[],
): Promise<void> {
  for (const api of sarvamApis) {
    const list = recordings.filter((recording) => recording.api === api);
    await writeFile(
      new URL(recordingFiles[api], dir),
      `${JSON.stringify(list, null, 2)}\n`,
    );
  }
}

function capture(
  request: SarvamRequest,
  response: unknown,
  { line, input, time }: { line: string; input: string; time: number },
): Recording {
  const settings = request.settings ?? {};
  const safe =
    settings.reasoning_effort === safeSarvam.reasoning_effort &&
    settings.max_tokens === safeSarvam.max_tokens;
  return {
    api: request.api,
    model: request.model,
    input_sha256: inputHash(request.input),
    input,
    line,
    ...(request.api === "chat" && !safe ? { when: settings } : {}),
    ...(textWhen(request) ?? {}),
    placeholder: false,
    recorded_at: new Date(time).toISOString(),
    response,
  };
}

// A translation or a transliteration is saved for its target language, so
// that one text can have an answer in each language. Translations to English
// keep no condition, like the answers of the reading pipeline.
function textWhen(
  request: SarvamRequest,
): { when: { target_language_code: string } } | undefined {
  const target = request.settings?.target_language_code;
  if (request.api !== "translate" && request.api !== "transliterate") {
    return undefined;
  }
  return typeof target === "string" && target !== "en-IN"
    ? { when: { target_language_code: target } }
    : undefined;
}

function key(recording: Recording): string {
  return JSON.stringify([
    recording.api,
    recording.model,
    recording.input_sha256,
    recording.when ?? null,
  ]);
}

function isOrphan(
  recording: Recording,
  recordedTexts: ReadonlyMap<string, string>,
): boolean {
  const text =
    recording.line === undefined
      ? undefined
      : recordedTexts.get(recording.line);
  return (
    recording.placeholder &&
    recording.api !== "speech_to_text" &&
    text !== undefined &&
    recording.input !== text
  );
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      lines: { type: "string" },
      incident: { type: "boolean", default: false },
      texts: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  try {
    const summary = await recordFixtures({
      env: process.env,
      lines: values.lines?.split(",").map((id) => id.trim()),
      incident: values.incident,
      texts: values.texts,
      dryRun: values["dry-run"],
      print: (line) => console.log(line),
    });
    process.exitCode = summary.stopped === null ? 0 : 1;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
