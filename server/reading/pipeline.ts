import { randomUUID } from "node:crypto";
import { istDay, type Day } from "../../shared/day.ts";
import type { SarvamLanguage } from "../../shared/languages.ts";
import type { OrderSource } from "../../shared/model.ts";
import type {
  CartReadAnswer,
  DeskReadAnswer,
  DraftCapacity,
  DraftItem,
  ItemReadAnswer,
  ReadOutcome,
  ReadPath,
  ReadTrace,
  ReadVariant,
} from "../../shared/reading.ts";
import type { Clock } from "../clock.ts";
import {
  safeSarvam,
  type CfgSarvam,
  type FlagValues,
  type Flags,
  type OrderFlags,
} from "../flags/decisions.ts";
import { languageLabel, type SarvamDeps } from "../sarvam/call.ts";
import { chatJson } from "../sarvam/chat.ts";
import { identifyLanguage } from "../sarvam/language-id.ts";
import { translateToEnglish } from "../sarvam/translate.ts";
import { buildDraft, emptyDraft, type DraftParts } from "./draft.ts";
import {
  itemAnswerSchema,
  itemOfAnswer,
  itemPrompt,
  itemSchemaName,
} from "./item.ts";
import type { ReadingItem } from "./menu.ts";
import type { Heard, ReadKind } from "./parts.ts";
import {
  readingPrompt,
  readingSchema,
  readingSchemaName,
  type Reading,
} from "./prompt.ts";

export type ReadingDeps = SarvamDeps & { flags: Flags; clock: Clock };

export type DayCapacityCheck = (
  day: Day,
  items: readonly DraftItem[],
) => DraftCapacity;

export type ReadRequest = {
  kind: ReadKind;
  store: { slug: string; is_demo: boolean };
  menu: readonly ReadingItem[];
  source: OrderSource;
  heard: Heard;
  identify: boolean;
  checkDay?: DayCapacityCheck | undefined;
};

export type ReadResult = {
  decision: OrderFlags;
  order_id: string;
  transcript: string;
  translation: string | null;
  language: SarvamLanguage | null;
  path: ReadPath;
  variant: ReadVariant | null;
  outcome: ReadOutcome;
  show_manual: boolean;
  recorded: boolean;
  placeholder: boolean;
  draft: DraftParts & { capacity: DraftCapacity | null };
  trace: ReadTrace;
};

type TextReading = {
  outcome: ReadOutcome;
  reading?: Reading;
  translation: string | null;
  placeholder: boolean;
};

export async function readOrder(
  deps: ReadingDeps,
  request: ReadRequest,
  signal?: AbortSignal,
): Promise<ReadResult> {
  const started = performance.now();
  const { transcript } = request.heard;
  const identified =
    request.heard.language === null && request.identify
      ? await identify(deps, transcript, signal)
      : { language: request.heard.language, placeholder: false };
  const { language } = identified;
  const orderId = randomUUID();
  const decision = await deps.flags.forOrder(
    orderId,
    {
      store: request.store.slug,
      source: request.source,
      language: language ?? undefined,
      is_demo: request.store.is_demo,
    },
    signal,
  );
  const path = decision.ops_reading;
  const variant = readVariant(request, decision);
  const exposed = countsForExperiment(request, decision);
  if (exposed) deps.flags.recordExposure(decision);
  const today = istDay(deps.clock.now());
  const read: TextReading =
    variant === null
      ? { outcome: "ok", translation: null, placeholder: false }
      : await readText(
          deps,
          {
            text: transcript,
            menu: request.menu,
            today,
            language,
            variant,
            cfg: path === "safe" ? safeSarvam : decision.cfg_sarvam,
          },
          signal,
        );
  deps.metrics.readingResults.inc({
    language: languageLabel(language),
    variant: variant ?? "none",
    path,
    outcome: read.outcome,
  });
  const parts =
    read.reading === undefined
      ? emptyDraft()
      : buildDraft(request.menu, read.reading, today);
  const capacity =
    parts.day === null || request.checkDay === undefined
      ? null
      : request.checkDay(parts.day, parts.items);
  return {
    decision,
    order_id: orderId,
    transcript,
    translation: read.translation,
    language,
    path,
    variant,
    outcome: read.outcome,
    show_manual: path === "manual" || read.outcome !== "ok",
    recorded: deps.sarvam.mode === "recorded",
    placeholder:
      request.heard.placeholder || identified.placeholder || read.placeholder,
    draft: { ...parts, capacity },
    trace: {
      segment: decision.segment,
      flags_from: decision.from,
      in_experiment: exposed,
      duration_ms: Math.round(performance.now() - started),
      show: decision.cfg_demo_trace,
    },
  };
}

export type ItemReadRequest = {
  heard: Heard;
  flags: Pick<FlagValues, "ops_suggestions" | "ops_reading" | "cfg_sarvam">;
};

export type ItemReadResult = ItemReadAnswer & { missing: boolean };

// The item mode of the pipeline, for seller setup: no menu, no day and no
// experiment. It reads on the native path with the environment flags, and
// the safe setting when ops_reading is safe. With ops_suggestions off it
// reads nothing: the manual path, where she fills in the item form.
export async function readItem(
  deps: SarvamDeps,
  { heard, flags }: ItemReadRequest,
  signal?: AbortSignal,
): Promise<ItemReadResult> {
  const path: ReadPath =
    flags.ops_suggestions === "off"
      ? "manual"
      : flags.ops_reading === "safe"
        ? "safe"
        : "ai";
  const cfg = path === "safe" ? safeSarvam : flags.cfg_sarvam;
  const { transcript, language } = heard;
  const answer =
    path === "manual"
      ? undefined
      : await chatJson(
          deps,
          {
            model: cfg.reading_model,
            system: itemPrompt(),
            user: transcript,
            schema: itemAnswerSchema,
            schemaName: itemSchemaName,
            reasoning_effort: cfg.reasoning_effort,
            max_tokens: cfg.max_tokens,
            language,
          },
          signal,
        );
  const outcome: ReadOutcome =
    answer === undefined || answer.ok ? "ok" : answer.outcome;
  deps.metrics.readingResults.inc({
    language: languageLabel(language),
    variant: answer === undefined ? "none" : "native",
    path,
    outcome,
  });
  const item = answer?.ok ? itemOfAnswer(answer.value) : null;
  return {
    transcript,
    language,
    path,
    outcome,
    show_manual: item === null || item.name === null,
    recorded: deps.sarvam.mode === "recorded",
    placeholder:
      heard.placeholder || (answer?.ok === true && answer.placeholder),
    item,
    missing: answer?.ok === false && answer.missing,
  };
}

export function readVariant(
  request: Pick<ReadRequest, "kind" | "source">,
  decision: Pick<OrderFlags, "ops_reading" | "exp_reading_path">,
): ReadVariant | null {
  if (decision.ops_reading === "manual") return null;
  if (
    decision.ops_reading === "safe" ||
    request.kind === "cart" ||
    request.source === "load"
  ) {
    return "native";
  }
  return decision.exp_reading_path;
}

export function countsForExperiment(
  request: Pick<ReadRequest, "kind" | "source">,
  decision: Pick<OrderFlags, "ops_reading" | "in_experiment">,
): boolean {
  return (
    request.kind === "desk" &&
    decision.ops_reading === "ai" &&
    request.source !== "load" &&
    decision.in_experiment
  );
}

export function deskAnswer(result: ReadResult): DeskReadAnswer {
  return {
    ...answerFields(result),
    translation: result.translation,
    draft: { order_id: result.order_id, ...result.draft },
  };
}

export function cartAnswer(result: ReadResult): CartReadAnswer {
  const { items, unmatched, day, total } = result.draft;
  return { ...answerFields(result), cart: { items, unmatched, day, total } };
}

async function readText(
  deps: ReadingDeps,
  {
    text,
    menu,
    today,
    language,
    variant,
    cfg,
  }: {
    text: string;
    menu: readonly ReadingItem[];
    today: Day;
    language: SarvamLanguage | null;
    variant: ReadVariant;
    cfg: CfgSarvam;
  },
  signal?: AbortSignal,
): Promise<TextReading> {
  let read = text;
  let translation: string | null = null;
  let placeholder = false;
  if (variant === "translate_first" && language !== "en-IN") {
    const translated = await translateToEnglish(
      deps,
      { text, model: cfg.translation_model, language },
      signal,
    );
    if (!translated.ok) {
      return { outcome: translated.outcome, translation, placeholder: false };
    }
    translation = translated.value;
    read = translated.value;
    placeholder = translated.placeholder;
  }
  const answer = await chatJson(
    deps,
    {
      model: cfg.reading_model,
      system: readingPrompt(menu, today),
      user: read,
      schema: readingSchema,
      schemaName: readingSchemaName,
      reasoning_effort: cfg.reasoning_effort,
      max_tokens: cfg.max_tokens,
      language,
    },
    signal,
  );
  return answer.ok
    ? {
        outcome: "ok",
        reading: answer.value,
        translation,
        placeholder: placeholder || answer.placeholder,
      }
    : { outcome: answer.outcome, translation, placeholder };
}

async function identify(
  deps: ReadingDeps,
  text: string,
  signal?: AbortSignal,
): Promise<{ language: SarvamLanguage | null; placeholder: boolean }> {
  const result = await identifyLanguage(deps, text, signal);
  return result.ok
    ? { language: result.value, placeholder: result.placeholder }
    : { language: null, placeholder: false };
}

function answerFields(result: ReadResult) {
  const {
    transcript,
    language,
    path,
    variant,
    outcome,
    show_manual,
    recorded,
    placeholder,
    trace,
  } = result;
  return {
    transcript,
    language,
    path,
    variant,
    outcome,
    show_manual,
    recorded,
    placeholder,
    trace,
  };
}
