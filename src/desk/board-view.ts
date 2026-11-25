import type { Day } from "../../shared/day.ts";
import type { VegMark } from "../../shared/model.ts";
import { addDays } from "../../shared/day.ts";
import { deskBoardSchema, type DeskSlip } from "../../shared/orders.ts";
import type { Api } from "../api/api.ts";
import { leaveWithSound } from "../sound/leave.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import type { Board, BoardDay } from "./board.ts";
import { fillGauge } from "./gauge-view.ts";
import type { SlipActions } from "./slip-actions.ts";
import { createSlip, fillSlip } from "./slip-view.ts";
import { paidByHand } from "./stamps.ts";

export type BoardView = {
  load(): Promise<void>;
  render(): void;
  slipElement(id: string): HTMLElement | undefined;
};

type Rendered = { slip: DeskSlip; ui: string };

// Her days, each with its gauge and its slips. Sections and slips are kept
// by key and filled in place, and the board listens for clicks once.
export function createBoardView({
  root,
  api,
  templates,
  board,
  actions,
  text,
  latinNames,
  vegMarks,
  onEdit,
  onCancel,
  onShare,
}: {
  root: HTMLElement;
  api: Pick<Api, "get">;
  templates: {
    day: HTMLTemplateElement;
    slip: HTMLTemplateElement;
    line: HTMLTemplateElement;
  };
  board: Board;
  actions: SlipActions;
  text: Text;
  latinNames: ReadonlyMap<string, string | null>;
  vegMarks: ReadonlyMap<string, VegMark>;
  onEdit: (slip: DeskSlip) => void;
  onCancel: (slip: DeskSlip) => void;
  // Send on WhatsApp: its sound plays before WhatsApp opens.
  onShare: () => void;
}): BoardView {
  const days = part(root, "#board-days");
  const empty = part(root, "#board-empty");
  const problem = part(root, "#board-problem");
  const wait = createWait({
    control: root,
    line: document.querySelector("#open-wait"),
  });
  const sections = new Map<Day, HTMLElement>();
  const items = new Map<string, HTMLLIElement>();
  const rendered = new Map<string, Rendered>();
  let loaded = false;

  const sectionFor = (day: BoardDay): HTMLElement => {
    let section = sections.get(day.day);
    if (section === undefined) {
      const made = templates.day.content.firstElementChild?.cloneNode(true);
      if (!(made instanceof HTMLElement)) {
        throw new Error("The day template needs one element.");
      }
      section = made;
      section.dataset.day = day.day;
      sections.set(day.day, section);
    }
    const name = section.querySelector(".gauge-day");
    if (name) name.textContent = dayName(day.day, board.today, text);
    fillGauge(
      section,
      { unit: board.unit, limit: board.limit, load: day.load, past: day.past },
      text,
    );
    return section;
  };

  const itemFor = (slip: DeskSlip): HTMLLIElement => {
    let item = items.get(slip.id);
    if (item === undefined) {
      item = createSlip(templates.slip);
      items.set(slip.id, item);
    }
    const ui = actions.ui(slip.id);
    const key = JSON.stringify({ ...ui, error: codeOf(ui.error) });
    const landing = actions.takeLanding(slip.id);
    const last = rendered.get(slip.id);
    if (last?.slip !== slip || last.ui !== key || landing !== undefined) {
      fillSlip(item, slip, {
        text,
        lineTemplate: templates.line,
        latinNames,
        vegMarks,
        ui,
        landing,
      });
      rendered.set(slip.id, { slip, ui: key });
    }
    return item;
  };

  const render = () => {
    const boardDays = board.days();
    empty.hidden = !loaded || boardDays.length > 0;
    const wantedSections = boardDays.map((day) => {
      const section = sectionFor(day);
      const list = section.querySelector(".slips");
      if (list) placeInOrder(list, day.slips.map(itemFor));
      return section;
    });
    const seen = new Set(boardDays.map((day) => day.day));
    for (const [day, section] of sections) {
      if (!seen.has(day)) {
        section.remove();
        sections.delete(day);
      }
    }
    const ids = new Set(
      boardDays.flatMap((day) => day.slips.map((slip) => slip.id)),
    );
    for (const [id, item] of items) {
      if (!ids.has(id)) {
        item.remove();
        items.delete(id);
        rendered.delete(id);
      }
    }
    placeInOrder(days, wantedSections);
  };

  // The old board stays until the new one arrives; a failure says what to do.
  const load = async () => {
    try {
      const answer = await wait.run(
        (signal) => api.get("/api/desk/orders", deskBoardSchema, { signal }),
        text.t("desk.board.opening"),
      );
      problem.hidden = true;
      board.load(answer);
    } catch (error) {
      const words = text.error(error, "desk");
      if (words === "") return;
      part(problem, ".error").textContent = words;
      problem.hidden = false;
    }
  };
  part(problem, "button").addEventListener("click", () => void load());

  days.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const share = event.target.closest<HTMLAnchorElement>(".slip-share");
    if (share !== null) {
      leaveWithSound(event, share, onShare);
      return;
    }
    const button = event.target.closest("button");
    const id = button?.closest<HTMLElement>(".slip")?.dataset.id;
    if (button === null || id === undefined) return;
    const slip = board.get(id);
    if (slip === undefined) return;
    if (button.matches(".slip-next")) actions.stamp(id);
    else if (button.matches(".slip-pay")) actions.markPaid(id);
    else if (button.closest(".slip-undo")) actions.undo(id);
    else if (button.closest(".slip-keep")) actions.keep(id);
    else if (button.matches(".slip-edit")) onEdit(slip);
    else if (button.matches(".slip-cancel")) onCancel(slip);
    else if (button.matches(".slip-refund")) {
      actions.refund(id, !paidByHand(slip, actions.ui(id).handPaid));
    }
  });

  board.subscribe(() => {
    loaded = true;
    render();
  });
  actions.subscribe(() => render());

  return {
    load,
    render,
    slipElement: (id) =>
      items.get(id)?.querySelector<HTMLElement>(".slip") ?? undefined,
  };
}

export function dayName(day: Day, today: Day | undefined, text: Text): string {
  const long = text.day(day, "long");
  if (today === undefined) return long;
  if (day === today) return `${text.t("desk.day.today")} · ${long}`;
  if (day === addDays(today, 1))
    return `${text.t("desk.day.tomorrow")} · ${long}`;
  return long;
}

// Moves nodes only when their order changed, because moving a node takes
// the focus away from a button inside it.
function placeInOrder(parent: Element, wanted: readonly Element[]): void {
  const current = [...parent.children];
  if (
    current.length === wanted.length &&
    current.every((child, index) => child === wanted[index])
  ) {
    return;
  }
  parent.replaceChildren(...wanted);
}

function codeOf(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "unknown";
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The board has no ${selector}.`);
  return found;
}
