import type {
  FlagKind,
  OpsFlagValue,
  OpsSarvamConfig,
  OpsSegment,
} from "../../shared/ops.ts";
import type { Text, TextKey } from "../text/text.ts";
import { wholeNumber } from "./console-format.ts";
import { languageName } from "./ops-model.ts";

type Words = Pick<Text, "t">;

export const kindKeys: Record<FlagKind, TextKey> = {
  ops: "ops.flagsmith.kind_ops",
  exp: "ops.flagsmith.kind_exp",
  cfg: "ops.flagsmith.kind_cfg",
};

export function valueWords(value: OpsFlagValue, text: Words): string {
  if (typeof value === "boolean") {
    return text.t(value ? "ops.flagsmith.on" : "ops.flagsmith.off");
  }
  return typeof value === "string" ? value : sarvamWords(value, text);
}

export function sarvamWords(config: OpsSarvamConfig, text: Words): string {
  return text.t("ops.flagsmith.sarvam", {
    speech: config.speech_model,
    reading: config.reading_model,
    reasoning: config.reasoning_effort ?? text.t("ops.flagsmith.reasoning_off"),
    tokens: wholeNumber(config.max_tokens),
  });
}

export function segmentWords(segment: OpsSegment, text: Words) {
  return {
    language: `${text.t(languageName(segment.language))} (${segment.language})`,
    from: text.t(
      segment.from === "flagsmith"
        ? "ops.flagsmith.from_flagsmith"
        : "ops.flagsmith.from_defaults",
    ),
    experiment: text.t(
      segment.in_experiment
        ? "ops.flagsmith.in_experiment"
        : "ops.flagsmith.not_in_experiment",
    ),
    sarvam: sarvamWords(segment.cfg_sarvam, text),
  };
}
