import type { OpsFlags } from "../../shared/ops.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { clockTime, wholeNumber } from "./console-format.ts";
import {
  kindKeys,
  sarvamWords,
  segmentWords,
  valueWords,
} from "./flags-model.ts";

export const flagsEverySeconds = 30;

export function createFlagsView(root: ParentNode, text: Text) {
  const part = (selector: string) => find(root, selector, HTMLElement);
  const clone = (selector: string) =>
    cloneTemplate(find(root, selector, HTMLTemplateElement));
  const fill = (row: ParentNode, selector: string, words: string) => {
    find(row, selector, HTMLElement).textContent = words;
  };
  const fact = (name: string, value: string) => {
    const row = clone("#fact-row");
    fill(row, ".fact-name", name);
    fill(row, ".fact-value", value);
    return row;
  };
  const error = part("#flags-error");

  return {
    show(report: OpsFlags): void {
      const { connection, experiment } = report;
      error.hidden = true;
      part("#flags-grid").hidden = false;
      part("#flags-read").textContent = [
        text.t("ops.read_at", {
          time: clockTime(report.read_at),
          seconds: flagsEverySeconds,
        }),
        text.t("ops.started_at", { time: clockTime(report.started_at) }),
      ].join(" ");
      part("#connection-state").textContent = text.t(
        connection.source === "flagsmith"
          ? "ops.flagsmith.connected"
          : "ops.flagsmith.defaults",
      );
      part("#api-url").textContent = connection.api_url;
      part("#admin-api-url").textContent = connection.admin_api_url;
      part("#key-rows").replaceChildren(
        ...connection.keys.map(({ name, set }) =>
          fact(name, text.t(set ? "ops.set" : "ops.not_set")),
        ),
      );
      part("#changes-via").textContent = text.t(
        connection.changes_via === "flagsmith"
          ? "ops.flagsmith.changes_flagsmith"
          : "ops.flagsmith.changes_memory",
      );
      part("#flag-rows").replaceChildren(
        ...report.flags.map((flag) => {
          const row = clone("#flag-row");
          row.dataset.flag = flag.name;
          fill(row, ".flag-name", flag.name);
          fill(row, ".flag-kind", text.t(kindKeys[flag.kind]));
          fill(row, ".flag-value", valueWords(flag.value, text));
          fill(row, ".flag-default", valueWords(flag.default, text));
          find(row, ".flag-changed", HTMLElement).hidden = flag.is_default;
          return row;
        }),
      );
      part("#segment-rows").replaceChildren(
        ...report.segments.map((segment) => {
          const words = segmentWords(segment, text);
          const row = clone("#segment-row");
          row.dataset.segment = segment.segment;
          fill(row, ".segment-name", segment.segment);
          fill(row, ".segment-language", words.language);
          fill(row, ".segment-from", words.from);
          fill(row, ".segment-reading", segment.ops_reading);
          fill(row, ".segment-path", segment.exp_reading_path);
          fill(row, ".segment-experiment", words.experiment);
          fill(row, ".segment-sarvam", words.sarvam);
          for (const mark of row.querySelectorAll<HTMLElement>(
            "[data-memory]",
          )) {
            mark.hidden = !segment.in_memory.some(
              (name) => name === mark.dataset.memory,
            );
          }
          return row;
        }),
      );
      part("#overrides-none").hidden = report.overrides.length > 0;
      part("#override-rows").replaceChildren(
        ...report.overrides.flatMap(({ segment, ops_reading, cfg_sarvam }) => [
          ...(ops_reading === null
            ? []
            : [fact(`${segment} · ops_reading`, ops_reading)]),
          ...(cfg_sarvam === null
            ? []
            : [fact(`${segment} · cfg_sarvam`, sarvamWords(cfg_sarvam, text))]),
        ]),
      );
      part("#experiment-metric").textContent = text.t(
        "ops.flagsmith.metric_text",
        { metric: experiment.metric },
      );
      part("#variation-rows").replaceChildren(
        ...experiment.variations.map((variation) => {
          const row = clone("#variation-row");
          fill(row, ".variation-value", variation.value);
          fill(
            row,
            ".variation-key",
            text.t("ops.flagsmith.variant_key", { key: variation.key }),
          );
          fill(row, ".variation-exposures", wholeNumber(variation.exposures));
          fill(
            row,
            ".variation-conversions",
            wholeNumber(variation.conversions),
          );
          return row;
        }),
      );
      part("#experiment-outside").textContent = text.t(
        "ops.flagsmith.outside",
        { count: wholeNumber(experiment.conversions_outside) },
      );
    },
    problem(words: string): void {
      error.hidden = false;
      error.textContent = text.t("ops.load_failed", { problem: words });
    },
  };
}
