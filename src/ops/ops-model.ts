import { toAppLanguage } from "../../shared/languages.ts";
import type { ChangeVia, OpsLanguage, OpsState } from "../../shared/ops.ts";
import type { TextKey } from "../text/text.ts";

export type RowView = {
  code: string;
  name: TextKey;
  readings: number;
  invalid: number;
  share: string | null;
  alert: TextKey;
  held: string;
  fires: boolean;
};

export type RunView = {
  watching: boolean;
  approval: boolean;
  approved: ChangeVia | null;
  rejected: boolean;
  recovery: { readings: number; invalid: number; recovered: boolean } | null;
};

const alertWords: Record<OpsLanguage["state"], TextKey> = {
  inactive: "ops.readings.quiet",
  pending: "ops.readings.pending",
  firing: "ops.readings.firing",
};

export function languageRow(row: OpsLanguage): RowView {
  return {
    code: row.language,
    name: languageName(row.language),
    readings: row.readings,
    invalid: row.invalid,
    share: sharePercent(row.invalid_rate),
    alert: alertWords[row.state],
    held: heldClock(row.held_seconds),
    fires: row.would_fire,
  };
}

export function runView({ incident }: OpsState): RunView {
  const since = incident.since_change;
  return {
    watching: incident.step === "watching",
    approval: incident.step === "approval",
    approved: incident.step === "approved" ? (incident.via ?? "memory") : null,
    rejected: incident.step === "rejected",
    recovery:
      incident.step === "approved" && since !== null
        ? { ...since, recovered: since.readings > 0 && since.invalid === 0 }
        : null,
  };
}

export function languageName(code: string): TextKey {
  if (code === "unknown") return "ops.language.unknown";
  const language = toAppLanguage(code);
  return language === undefined
    ? "ops.language.other"
    : `ops.language.${language}`;
}

export function sharePercent(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate * 100)}%`;
}

export function heldClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
