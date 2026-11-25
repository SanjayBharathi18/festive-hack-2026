import type { OpsState } from "../../shared/ops.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import type { Text, TextKey } from "../text/text.ts";
import { languageRow, runView } from "./ops-model.ts";

export type OpsView = ReturnType<typeof createOpsView>;
export type Place = "decision" | "control";

export function createOpsView(root: ParentNode, text: Text) {
  const part = (selector: string) => find(root, selector, HTMLElement);
  const rows = part("#language-rows");
  const rowTemplate = find(root, "#language-row", HTMLTemplateElement);
  const stale = part("#stale");
  const results: Record<Place, { done: HTMLElement; error: HTMLElement }> = {
    decision: { done: part("#approved"), error: part("#decision-error") },
    control: { done: part("#control-done"), error: part("#control-error") },
  };
  const say = (element: HTMLElement, words: string | null) => {
    element.hidden = words === null;
    element.textContent = words ?? "";
  };

  return {
    show(state: OpsState): void {
      part("#recorded-badge").hidden = !state.recorded;
      rows.replaceChildren(
        ...state.languages.map((language) => {
          const view = languageRow(language);
          const row = cloneTemplate(rowTemplate);
          row.dataset.language = view.code;
          if (view.fires) row.dataset.fires = "";
          find(row, ".ops-language", HTMLElement).textContent = text.t(
            view.name,
          );
          find(row, ".ops-count", HTMLElement).textContent = String(
            view.readings,
          );
          find(row, ".ops-invalid", HTMLElement).textContent = String(
            view.invalid,
          );
          find(row, ".ops-share", HTMLElement).textContent =
            view.share ?? text.t("ops.readings.no_share");
          find(row, ".ops-state", HTMLElement).textContent = text.t(
            view.alert,
            { held: view.held },
          );
          return row;
        }),
      );
      const run = runView(state);
      part("#run-watching").hidden = !run.watching;
      part("#run-steps").hidden = run.watching;
      part("#approval-actions").hidden = !run.approval;
      say(
        results.decision.done,
        run.approved === null
          ? null
          : text.t(
              run.approved === "flagsmith"
                ? "ops.run.approved_flagsmith"
                : "ops.run.approved_memory",
            ),
      );
      if (!run.approval) say(results.decision.error, null);
      part("#rejected").hidden = !run.rejected;
      part("#step-recovery").hidden = run.recovery === null;
      if (run.recovery !== null) {
        const { readings, invalid, recovered } = run.recovery;
        part("#recovery-count").textContent =
          readings === 0
            ? text.t("ops.run.recovery_wait")
            : text.t("ops.run.recovery", { readings, invalid });
        part("#recovered").hidden = !recovered;
      }
      const memory = state.flags_from === "defaults";
      part("#controls-memory").hidden = !memory;
      part("#controls-flagsmith").hidden = memory;
      find(root, "#trigger", HTMLButtonElement).hidden = !memory;
    },
    stale(problem: string | null): void {
      say(
        stale,
        problem === null ? null : text.t("ops.readings.stale", { problem }),
      );
    },
    result(place: Place, done: TextKey | null, error: string | null): void {
      if (place === "control") say(results.control.done, done && text.t(done));
      say(results[place].error, error);
    },
  };
}
