import { sarvamOutcomeSchema, type OpsSarvam } from "../../shared/ops.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { clockTime, unitsNumber, wholeNumber } from "./console-format.ts";

export const sarvamEverySeconds = 5;

export function createSarvamView(root: ParentNode, text: Text) {
  const part = (selector: string) => find(root, selector, HTMLElement);
  const clone = (selector: string) =>
    cloneTemplate(find(root, selector, HTMLTemplateElement));
  const fill = (row: ParentNode, selector: string, words: string) => {
    find(row, selector, HTMLElement).textContent = words;
  };
  const error = part("#sarvam-error");

  return {
    show(report: OpsSarvam): void {
      const { recordings } = report;
      error.hidden = true;
      part("#sarvam-grid").hidden = false;
      part("#sarvam-read").textContent = [
        text.t("ops.read_at", {
          time: clockTime(report.read_at),
          seconds: sarvamEverySeconds,
        }),
        text.t("ops.started_at", { time: clockTime(report.started_at) }),
      ].join(" ");
      part("#sarvam-mode").textContent = text.t(
        report.mode === "live" ? "ops.sarvam.live" : "ops.sarvam.recorded",
      );
      part("#sarvam-url").textContent = report.base_url;
      part("#sarvam-key").textContent = text.t(
        report.api_key_set ? "ops.set" : "ops.not_set",
      );
      part("#saved-summary").textContent = text.t("ops.sarvam.saved", {
        saved: wholeNumber(recordings.saved),
        placeholders: wholeNumber(recordings.placeholders),
        test_only: wholeNumber(recordings.test_only),
      });
      part("#recording-rows").replaceChildren(
        ...recordings.by_api.map(({ api, saved, placeholders }) => {
          const row = clone("#recording-row");
          fill(row, ".recording-api", api);
          fill(row, ".recording-saved", wholeNumber(saved));
          fill(row, ".recording-placeholders", wholeNumber(placeholders));
          return row;
        }),
      );
      part("#calls-table").hidden = report.calls.length === 0;
      part("#no-calls").hidden = report.calls.length > 0;
      part("#call-rows").replaceChildren(
        ...report.calls.map((call) => {
          const row = clone("#call-row");
          row.dataset.api = call.api;
          fill(row, ".call-api", call.api);
          fill(row, ".call-model", call.model);
          fill(row, ".call-total", wholeNumber(call.calls));
          for (const outcome of sarvamOutcomeSchema.options) {
            fill(
              row,
              `[data-outcome="${outcome}"]`,
              wholeNumber(call.outcomes[outcome]),
            );
          }
          return row;
        }),
      );
      part("#billed-table").hidden = report.billed.length === 0;
      part("#no-billed").hidden = report.billed.length > 0;
      part("#billed-rows").replaceChildren(
        ...report.billed.map(({ api, unit, units }) => {
          const row = clone("#billed-row");
          fill(row, ".billed-api", api);
          fill(row, ".billed-unit", unit);
          fill(row, ".billed-units", unitsNumber(units));
          return row;
        }),
      );
    },
    problem(words: string): void {
      error.hidden = false;
      error.textContent = text.t("ops.load_failed", { problem: words });
    },
  };
}
