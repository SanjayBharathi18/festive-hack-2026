import {
  appLanguageSchema,
  toAppLanguage,
  toSarvamLanguage,
  type AppLanguage,
} from "../../shared/languages.ts";
import { scriptOf, scriptOfLanguage } from "../../shared/scripts.ts";
import type { Translation } from "../../shared/translation.ts";
import { sourceLanguage } from "../catalog/search-form.ts";
import type { Clock } from "../clock.ts";
import type { Db } from "../db/database.ts";
import {
  flagDefaults,
  type FlagValues,
  type Flags,
} from "../flags/decisions.ts";
import type { Log } from "../log.ts";
import type { Metrics } from "../metrics/metrics.ts";
import type { SarvamTransport } from "../sarvam/api.ts";
import type { SarvamDeps } from "../sarvam/call.ts";
import { translateText } from "../sarvam/translate.ts";
import { transliterate, transliterateModel } from "../sarvam/transliterate.ts";
import {
  createTranslationCache,
  type TranslationKey,
} from "./translation-cache.ts";

export type { Translation };

export type NamedItem = { id: string; name: string; name_latin: string | null };

export type TranslatorDeps = {
  db: Db;
  clock: Clock;
  sarvam: SarvamTransport;
  metrics: Metrics;
  flags: Flags;
  log: Log;
  stopping: AbortSignal;
};

export type TranslateOptions = {
  from?: string | null | undefined;
  signal?: AbortSignal | undefined;
  waitMs?: number | undefined;
};

export type CachedOptions = {
  from?: string | null | undefined;
  onReady?: ((translation: Translation) => void) | undefined;
};

export type Translator = ReturnType<typeof createTranslator>;

export const translationWaitMs = 2_000;
export const translationMode = "modern-colloquial";
export const flagCheckMs = 10_000;
export const heardLimit = 10_000;

export function createTranslator(deps: TranslatorDeps) {
  const { flags, clock, stopping, log } = deps;
  const cache = createTranslationCache(deps.db, clock);
  const sarvam: SarvamDeps = {
    sarvam: deps.sarvam,
    metrics: deps.metrics,
    report: (call) => {
      if (call.outcome === "ok") return;
      log({
        msg: "a Sarvam call failed",
        api: call.api,
        model: call.model,
        language: call.language,
        outcome: call.outcome,
        status: call.status,
        reason: call.reason,
      });
    },
  };
  let known: Pick<
    FlagValues,
    "ops_translation" | "ops_transliteration" | "cfg_sarvam"
  > = flagDefaults;
  let checkedAt = Number.NEGATIVE_INFINITY;
  // The last answer for each name, placeholders too, for code that cannot
  // wait for Sarvam: a message names the dishes as the buyer's page did.
  const heard = new Map<string, string>();

  const environment = async (signal?: AbortSignal) => {
    const values = await flags.environment(signal);
    known = values;
    checkedAt = clock.now();
    return values;
  };

  environment(stopping).catch(() => {});
  const refresh = () => {
    if (clock.now() - checkedAt < flagCheckMs) return;
    checkedAt = clock.now();
    environment(stopping).catch(() => {});
  };

  const translation = (key: TranslationKey) =>
    cache.fill(key, async () => {
      const result = await translateText(
        sarvam,
        {
          text: key.text,
          model: key.model,
          source: key.source,
          target: key.target,
          mode: translationMode,
        },
        stopping,
        key.target,
      );
      return result.ok
        ? { text: result.value, save: !result.placeholder }
        : null;
    });

  // A placeholder answer is not cached. A Latin name is saved with its item,
  // so for it a placeholder counts as no answer.
  const transliteration = (key: TranslationKey, { placeholders = true } = {}) =>
    cache.fill(key, async () => {
      const result = await transliterate(
        sarvam,
        { text: key.text, source: key.source, target: key.target },
        stopping,
      );
      if (!result.ok || (result.placeholder && !placeholders)) return null;
      return { text: result.value, save: !result.placeholder };
    });
  const scriptName = (key: TranslationKey) =>
    transliteration(key).then((name) => {
      if (name !== null) remember(heard, heardKey(key), name);
      return name;
    });

  return {
    // The text in the language `to`, from the cache or from Sarvam. null when
    // the text needs no translation, ops_translation is off, or the call
    // fails or takes longer than waitMs. A slow call still fills the cache.
    translate: async (
      text: string | null,
      to: AppLanguage,
      {
        from = null,
        signal,
        waitMs = translationWaitMs,
      }: TranslateOptions = {},
    ): Promise<Translation | null> => {
      if (text === null || !needsTranslation(text, to, from)) return null;
      const values = await environment(signal);
      if (values.ops_translation !== "ai") return null;
      const key = translateKey(text, to, from, values.cfg_sarvam);
      return asTranslation(
        await within(translation(key), waitMs, signal),
        key.text,
        to,
      );
    },
    // The same, with no wait, for code that builds its answer at once: the
    // cached translation or null. A miss starts the call, and onReady gets its
    // result. ops_translation is the value of the last check, at most
    // flagCheckMs old.
    cached: (
      text: string | null,
      to: AppLanguage,
      { from = null, onReady }: CachedOptions = {},
    ): Translation | null => {
      if (text === null || !needsTranslation(text, to, from)) return null;
      refresh();
      if (known.ops_translation !== "ai") return null;
      const key = translateKey(text, to, from, known.cfg_sarvam);
      const hit = cache.get(key);
      if (hit !== undefined) return asTranslation(hit, key.text, to);
      void translation(key).then((result) => {
        const done = asTranslation(result, key.text, to);
        if (done !== null) onReady?.(done);
      });
      return null;
    },
    // The item names in the script of `to`, by item id, from the Latin form.
    // Names already in that script are left out. ops_transliteration off
    // gives no names, so the page shows the original script.
    scriptNames: async (
      items: readonly NamedItem[],
      to: AppLanguage,
      { signal, waitMs = translationWaitMs }: TranslateOptions = {},
    ): Promise<Map<string, string>> => {
      const names = new Map<string, string>();
      const values = await flags.environment(signal);
      if (values.ops_transliteration !== "ai") return names;
      const work: Promise<void>[] = [];
      for (const item of items) {
        const latin = latinSource(item, to);
        if (latin === undefined) continue;
        if (to === "en") {
          names.set(item.id, latin);
          continue;
        }
        const key = transliterateKey(latin, to);
        const hit = cache.get(key) ?? heard.get(heardKey(key));
        if (hit !== undefined) {
          names.set(item.id, hit);
          continue;
        }
        work.push(
          scriptName(key).then((name) => {
            if (name !== null) names.set(item.id, name);
          }),
        );
      }
      if (work.length > 0) await within(Promise.all(work), waitMs, signal);
      return new Map(names);
    },
    // The same names with no wait, for code that builds its answer at once,
    // such as a message: from the cache or an earlier answer. A miss starts
    // the call for the next time. ops_transliteration is the value of the
    // last check, at most flagCheckMs old.
    knownNames: (
      items: readonly NamedItem[],
      to: AppLanguage,
    ): Map<string, string> => {
      const names = new Map<string, string>();
      refresh();
      if (known.ops_transliteration !== "ai") return names;
      for (const item of items) {
        const latin = latinSource(item, to);
        if (latin === undefined) continue;
        if (to === "en") {
          names.set(item.id, latin);
          continue;
        }
        const key = transliterateKey(latin, to);
        const hit = cache.get(key) ?? heard.get(heardKey(key));
        if (hit === undefined) void scriptName(key);
        else names.set(item.id, hit);
      }
      return names;
    },
    // The Latin form of each item name in an Indian script that has none, by
    // item id, for search (docs/system.md, "Search"). A name with no answer
    // in waitMs is left out, and ops_transliteration off gives no names.
    latinNames: async (
      items: readonly NamedItem[],
      { signal, waitMs = translationWaitMs }: TranslateOptions = {},
    ): Promise<Map<string, string>> => {
      const names = new Map<string, string>();
      const values = await flags.environment(signal);
      if (values.ops_transliteration !== "ai") return names;
      const work = items.flatMap((item) => {
        const source =
          item.name_latin === null ? sourceLanguage(item.name) : null;
        if (source === null) return [];
        const key = latinKey(item.name.trim(), source);
        return transliteration(key, { placeholders: false }).then((latin) => {
          if (latin !== null) names.set(item.id, latin);
        });
      });
      if (work.length > 0) await within(Promise.all(work), waitMs, signal);
      return new Map(names);
    },
  };
}

export function needsTranslation(
  text: string,
  to: AppLanguage,
  from: string | null,
): boolean {
  if (text.trim() === "") return false;
  if (from === null) return scriptOf(text) !== scriptOfLanguage[to];
  return appLanguageOf(from) !== to;
}

export function latinSource(
  { name, name_latin }: NamedItem,
  to: AppLanguage,
): string | undefined {
  if (scriptOf(name) === scriptOfLanguage[to]) return undefined;
  const latin = name_latin?.trim() ?? "";
  return latin !== "" && scriptOf(latin) === "latin" ? latin : undefined;
}

export function translateKey(
  text: string,
  to: AppLanguage,
  from: string | null,
  cfg: Pick<FlagValues["cfg_sarvam"], "translation_model">,
): TranslationKey {
  const language = from === null ? undefined : appLanguageOf(from);
  return {
    kind: "translate",
    model: cfg.translation_model,
    source:
      language !== undefined ? toSarvamLanguage(language) : (from ?? "auto"),
    target: toSarvamLanguage(to),
    text: text.trim(),
  };
}

export function transliterateKey(
  latin: string,
  to: AppLanguage,
): TranslationKey {
  return {
    kind: "transliterate",
    model: transliterateModel,
    source: "en-IN",
    target: toSarvamLanguage(to),
    text: latin,
  };
}

export function latinKey(name: string, source: string): TranslationKey {
  return {
    kind: "transliterate",
    model: transliterateModel,
    source,
    target: "en-IN",
    text: name,
  };
}

function heardKey({ target, text }: TranslationKey): string {
  return `${target} ${text}`;
}

// The oldest name goes first, so the memory stays small.
function remember(names: Map<string, string>, key: string, name: string) {
  names.delete(key);
  names.set(key, name);
  if (names.size <= heardLimit) return;
  const oldest = names.keys().next();
  if (!oldest.done) names.delete(oldest.value);
}

function appLanguageOf(code: string): AppLanguage | undefined {
  return appLanguageSchema.safeParse(code).data ?? toAppLanguage(code);
}

function asTranslation(
  text: string | null | undefined,
  original: string,
  language: AppLanguage,
): Translation | null {
  if (text === null || text === undefined) return null;
  return comparable(text) === comparable(original) ? null : { text, language };
}

function comparable(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function within<T>(
  work: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T | undefined> {
  if (signal?.aborted) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const finish = (value: T | undefined) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      resolve(value);
    };
    const stop = () => finish(undefined);
    const timer = setTimeout(stop, ms);
    signal?.addEventListener("abort", stop, { once: true });
    work.then(finish, stop);
  });
}
