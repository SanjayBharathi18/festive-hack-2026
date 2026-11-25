import type { z } from "zod";
import {
  flagDefaults,
  flagSchemas,
  variantKeys,
  type Enrolment,
  type ExperimentPath,
  type FlagName,
  type FlagValues,
} from "./decisions.ts";

export type FlagKind = "on_off" | "value" | "json" | "experiment";

export const flagKinds: Readonly<Record<FlagName, FlagKind>> = {
  ops_voice: "on_off",
  ops_reading: "value",
  ops_suggestions: "value",
  ops_search: "value",
  ops_transliteration: "value",
  ops_translation: "value",
  ops_review_check: "value",
  exp_reading_path: "experiment",
  cfg_sarvam: "json",
  cfg_demo_trace: "on_off",
};

const schemas: { [Name in FlagName]: z.ZodType<FlagValues[Name]> } =
  flagSchemas;

export const flagNames = Object.keys(flagKinds) as FlagName[];
export const experimentFlag = "exp_reading_path" satisfies FlagName;
export const conversionEvent = "order_saved_unedited";
export const maxValueBytes = 20_000;

export type StoredFlag = { enabled: boolean; value: unknown };
export type StoredDefault = { enabled: boolean; value: string | null };
export type FlagReading<Value> = { value: Value; problem?: string };
export type ExperimentState = StoredFlag & {
  isDefault?: boolean;
  variant?: string | undefined;
  experiment?: { id: number; inExperiment: boolean } | undefined;
};

export function isFlagName(name: string): name is FlagName {
  return Object.hasOwn(flagKinds, name);
}

export function storedDefault(name: FlagName): StoredDefault {
  const value = flagDefaults[name];
  switch (flagKinds[name]) {
    case "on_off":
      return { enabled: value === true, value: null };
    case "json":
      return { enabled: true, value: JSON.stringify(value, null, 2) };
    default:
      return { enabled: true, value: String(value) };
  }
}

export function readFlag<Name extends FlagName>(
  name: Name,
  flag: StoredFlag,
): FlagReading<FlagValues[Name]> {
  const fallback = flagDefaults[name];
  const kind = flagKinds[name];
  if (kind === "experiment" && !flag.enabled) return { value: fallback };
  const input =
    kind === "on_off"
      ? { ok: true as const, data: flag.enabled }
      : kind === "json"
        ? parseJson(flag.value)
        : { ok: true as const, data: flag.value };
  if (!input.ok) return { value: fallback, problem: input.problem };
  const result = schemas[name].safeParse(input.data);
  return result.success
    ? { value: result.data }
    : { value: fallback, problem: describeIssues(result.error) };
}

export function enrolmentFor(
  flag: ExperimentState,
  path: FlagReading<ExperimentPath>,
): { enrolment?: Enrolment; problem?: string } {
  const { experiment, variant } = flag;
  if (
    flag.isDefault === true ||
    !flag.enabled ||
    experiment?.inExperiment !== true ||
    variant === undefined ||
    path.problem !== undefined
  ) {
    return {};
  }
  if (variant !== variantKeys[path.value]) {
    return {
      problem:
        "the variant key does not match the value, so the order is not in the experiment",
    };
  }
  return { enrolment: { id: experiment.id, variant } };
}

function parseJson(
  value: unknown,
): { ok: true; data: unknown } | { ok: false; problem: string } {
  if (typeof value !== "string") {
    return { ok: false, problem: "is not a JSON string" };
  }
  if (Buffer.byteLength(value, "utf8") > maxValueBytes) {
    return { ok: false, problem: `is over ${maxValueBytes} bytes` };
  }
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch {
    return { ok: false, problem: "is not valid JSON" };
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map(({ path, message }) =>
      path.length > 0 ? `${path.join(".")}: ${message}` : message,
    )
    .join("; ");
}
