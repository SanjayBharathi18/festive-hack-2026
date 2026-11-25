import { z } from "zod";
import type { SarvamLanguage } from "../../shared/languages.ts";
import type { OrderSource } from "../../shared/model.ts";

export const readingPathSchema = z.enum(["ai", "safe", "manual"]);
export type ReadingPath = z.infer<typeof readingPathSchema>;

export const experimentPathSchema = z.enum(["native", "translate_first"]);
export type ExperimentPath = z.infer<typeof experimentPathSchema>;

export const variantKeys: Record<ExperimentPath, string> = {
  native: "control",
  translate_first: "translate_first",
};

export const cfgSarvamSchema = z.object({
  speech_model: z.string().min(1),
  speech_mode: z.string().min(1),
  reading_model: z.string().min(1),
  reasoning_effort: z.enum(["low", "medium", "high"]).nullable(),
  max_tokens: z.int().min(1).max(4096),
  translation_model: z.string().min(1),
});
export type CfgSarvam = z.infer<typeof cfgSarvamSchema>;

export const flagSchemas = {
  ops_voice: z.boolean(),
  ops_reading: readingPathSchema,
  ops_suggestions: z.enum(["ai", "off"]),
  ops_search: z.enum(["ai", "plain"]),
  ops_transliteration: z.enum(["ai", "off"]),
  ops_translation: z.enum(["ai", "off"]),
  ops_review_check: z.enum(["ai", "wordlist"]),
  exp_reading_path: experimentPathSchema,
  cfg_sarvam: cfgSarvamSchema,
  cfg_demo_trace: z.boolean(),
};

export type FlagName = keyof typeof flagSchemas;
export type FlagValues = {
  [Name in FlagName]: z.infer<(typeof flagSchemas)[Name]>;
};

export const safeSarvam: CfgSarvam = {
  speech_model: "saaras:v4",
  speech_mode: "codemix",
  reading_model: "sarvam-105b",
  reasoning_effort: null,
  max_tokens: 1024,
  translation_model: "mayura:v1",
};

export const flagDefaults: FlagValues = {
  ops_voice: true,
  ops_reading: "ai",
  ops_suggestions: "ai",
  ops_search: "ai",
  ops_transliteration: "ai",
  ops_translation: "ai",
  ops_review_check: "ai",
  exp_reading_path: "native",
  cfg_sarvam: safeSarvam,
  cfg_demo_trace: false,
};

export type OrderTraits = {
  store: string;
  source: OrderSource;
  language?: SarvamLanguage | undefined;
  is_demo: boolean;
};

export type Enrolment = { id: number; variant: string };

export type OrderFlags = {
  identity: string;
  ops_reading: ReadingPath;
  cfg_sarvam: CfgSarvam;
  exp_reading_path: ExperimentPath;
  in_experiment: boolean;
  experiment?: Enrolment | undefined;
  cfg_demo_trace: boolean;
  segment: string | null;
  from: "flagsmith" | "defaults";
};

export type Flags = {
  environment: (signal?: AbortSignal) => Promise<FlagValues>;
  forOrder: (
    orderId: string,
    traits: OrderTraits,
    signal?: AbortSignal,
  ) => Promise<OrderFlags>;
  recordExposure: (decision: OrderFlags) => void;
  recordConversion: (orderId: string) => void;
  close: (timeoutMs: number) => Promise<void>;
};

export function orderIdentity(orderId: string): string {
  return `order:${orderId}`;
}

export const languageSegments: Readonly<Record<string, string>> = {
  "kn-IN": "lang_kn",
  "hi-IN": "lang_hi",
  "en-IN": "lang_en",
};

export function segmentFor(language: string | undefined): string | null {
  return language !== undefined && Object.hasOwn(languageSegments, language)
    ? (languageSegments[language] ?? null)
    : null;
}

export function flagVariants(decision: OrderFlags): Record<string, string> {
  return {
    ops_reading: decision.ops_reading,
    exp_reading_path: decision.exp_reading_path,
    segment: decision.segment ?? "none",
    flags_from: decision.from,
  };
}
