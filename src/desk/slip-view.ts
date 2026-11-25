import type { VegMark } from "../../shared/model.ts";
import type { DeskSlip, OrderLine, Stamp } from "../../shared/orders.ts";
import { formatMoney } from "../text/format.ts";
import type { Text, TextKey } from "../text/text.ts";
import { packAmount } from "./amounts.ts";
import { shownName } from "../../shared/item-names.ts";
import { showName } from "../cart/name-view.ts";
import { languageOfText } from "./names.ts";
import type { SlipUi } from "./slip-actions.ts";
import {
  byHand,
  isOpen,
  isStamp,
  paidByHand,
  stampKind,
  tiltOf,
} from "./stamps.ts";
import { fillTranslated } from "./translated-view.ts";

export type SlipContext = {
  text: Text;
  lineTemplate: HTMLTemplateElement;
  latinNames: ReadonlyMap<string, string | null>;
  vegMarks: ReadonlyMap<string, VegMark>;
  ui?: SlipUi | undefined;
  landing?: "status" | "paid" | undefined;
};

const nextWords: Record<Stamp, TextKey | undefined> = {
  new: undefined,
  making: "desk.next.making",
  ready: "desk.next.ready",
  delivered: "desk.next.delivered",
  picked_up: "desk.next.picked_up",
};

export function createSlip(template: HTMLTemplateElement): HTMLLIElement {
  const item = template.content.firstElementChild?.cloneNode(true);
  if (!(item instanceof HTMLLIElement)) {
    throw new Error("The slip template needs one <li>.");
  }
  return item;
}

// Fills one order slip in place, so that a button keeps its focus when the
// slip changes under it.
export function fillSlip(
  item: HTMLLIElement,
  slip: DeskSlip,
  context: SlipContext,
): void {
  const { text, ui } = context;
  const article = part(item, ".slip");
  const closed = slip.status === "cancelled" || slip.status === "expired";
  const holding = ui?.cancelling !== undefined || ui?.refunding !== undefined;
  article.dataset.id = slip.id;
  article.style.setProperty("--tilt", tiltOf(slip.id));
  article.toggleAttribute("data-closed", closed);

  const title = part(item, ".slip-title");
  title.id = `slip-${slip.id}`;
  article.setAttribute("aria-labelledby", title.id);
  part(item, ".order-no").textContent = String(slip.number);

  fillWho(part(item, ".slip-who"), slip, text);
  const note = part(item, ".slip-note");
  note.hidden = slip.note === null;
  fillTranslated(
    note,
    [
      {
        element: part(item, ".slip-note-text"),
        original: slip.note,
        translation: slip.note_translation ?? null,
      },
    ],
    text,
  );

  fillLines(part(item, ".slip-lines tbody"), slip.lines, context);
  part(item, ".slip-amount").textContent = formatMoney(slip.total);

  const status = part(item, ".slip-status");
  const stamped = isStamp(slip.status) ? slip.status : undefined;
  status.hidden = stamped === undefined;
  if (stamped !== undefined) {
    status.textContent = text.t(`desk.stamp.${stamped}`);
    status.toggleAttribute("data-hand", byHand(stamped));
    if (stampKind(stamped) === "done") status.dataset.kind = "done";
    else delete status.dataset.kind;
  }
  const paid = part(item, ".slip-paid");
  paid.hidden = !slip.paid;
  paid.toggleAttribute("data-hand", paidByHand(slip, ui?.handPaid ?? false));
  if (context.landing === "status") land(status);
  if (context.landing === "paid") land(paid);

  const undo = part(item, ".slip-undo");
  undo.hidden = ui?.undoSeconds === undefined;
  part(undo, ".slip-seconds").textContent =
    ui?.undoSeconds === undefined ? "" : `${ui.undoSeconds} s`;

  fillState(item, slip, ui, text);

  const next = part<HTMLButtonElement>(item, ".slip-next");
  const nextKey =
    slip.next_stamp === null ? undefined : nextWords[slip.next_stamp];
  next.hidden = nextKey === undefined || holding;
  if (nextKey !== undefined) next.textContent = text.t(nextKey);
  part(item, ".slip-pay").hidden = slip.paid || closed || holding;
  part(item, ".slip-refund").hidden = !slip.paid || holding;
  const share = part<HTMLAnchorElement>(item, ".slip-share");
  share.hidden = slip.share_url === null || closed;
  if (slip.share_url !== null) share.href = slip.share_url;
  const changeable = isOpen(slip.status) && !holding;
  part(item, ".slip-edit").hidden = !changeable;
  part(item, ".slip-cancel").hidden = !changeable;

  const messages = part<HTMLDetailsElement>(item, ".slip-messages");
  messages.hidden = slip.messages.length === 0;
  part(messages, "ol").replaceChildren(
    ...slip.messages.map((message) => {
      const entry = document.createElement("li");
      entry.lang = message.language;
      entry.textContent = message.body;
      return entry;
    }),
  );
}

// The head says who and how: the buyer, pickup or delivery with its icon,
// the address of a delivery and a gift. CSS puts a dot between the parts.
function fillWho(who: HTMLElement, slip: DeskSlip, text: Text): void {
  const delivery = slip.fulfilment === "delivery";
  fillPart(part(who, ".slip-buyer"), slip.buyer_name);
  who
    .querySelector(".slip-way use")
    ?.setAttribute("href", `/icons.svg#${slip.fulfilment}`);
  part(who, ".slip-way-name").textContent = text.t(
    delivery ? "desk.slip.delivery" : "desk.slip.pickup",
  );
  fillPart(part(who, ".slip-place"), delivery ? slip.address : null);
  fillPart(
    part(who, ".slip-gift"),
    slip.gift === null
      ? null
      : text.t("desk.slip.gift", { name: slip.gift.name }),
  );
}

function fillPart(element: HTMLElement, words: string | null): void {
  element.hidden = words === null || words === "";
  setWords(element, words ?? "");
}

function fillLines(
  body: HTMLElement,
  lines: readonly OrderLine[],
  { text, lineTemplate, latinNames, vegMarks }: SlipContext,
): void {
  body.replaceChildren(
    ...lines.map((line) => {
      const row = lineTemplate.content.firstElementChild?.cloneNode(true);
      if (!(row instanceof HTMLTableRowElement)) {
        throw new Error("The line template needs one <tr>.");
      }
      fillMark(row, vegMarks.get(line.item_id), text);
      showName(
        { first: part(row, ".line-item"), second: part(row, ".line-latin") },
        shownName(
          { name: line.name, name_latin: latinNames.get(line.item_id) ?? null },
          text.language,
        ),
        text.language,
      );
      part(row, ".line-amount").textContent = packAmount(
        line.quantity,
        line.label,
      );
      part(row, ".line-price").textContent = formatMoney(
        line.price * line.quantity,
      );
      return row;
    }),
  );
}

// The FSSAI mark of the item on the menu. Egg counts as non-veg, and shows
// its word. An item that is no longer on the menu shows no mark.
function fillMark(
  row: HTMLElement,
  mark: VegMark | undefined,
  text: Text,
): void {
  const food = part(row, ".food-mark");
  food.hidden = mark === undefined;
  if (mark === "veg") delete food.dataset.food;
  else food.dataset.food = "non-veg";
  food.setAttribute(
    "aria-label",
    text.t(mark === "veg" ? "desk.slip.veg" : "desk.slip.non_veg"),
  );
  part(row, ".line-egg").hidden = mark !== "egg";
}

function fillState(
  item: HTMLElement,
  slip: DeskSlip,
  ui: SlipUi | undefined,
  text: Text,
): void {
  const words = part(item, ".slip-state-text");
  const keep = part(item, ".slip-keep");
  const amount = formatMoney(slip.total);
  const refund =
    ui?.refunded === undefined
      ? undefined
      : text.t("desk.slip.refunded", {
          amount: formatMoney(ui.refunded.amount),
        });
  let line = "";
  let error = false;
  let done = false;
  if (ui?.cancelling !== undefined) {
    line = text.t("desk.slip.cancelling");
  } else if (ui?.refunding !== undefined) {
    line = text.t("desk.slip.refunding", { amount });
  } else if (ui?.error !== undefined) {
    line = text.error(ui.error, "desk");
    error = line !== "";
  } else if (slip.status === "cancelled") {
    const cancelled = text.t("desk.slip.cancelled", {
      reason:
        slip.cancel_reason === null
          ? text.t("desk.cancel.reason.other")
          : text.t(`desk.cancel.reason.${slip.cancel_reason}`),
    });
    line = refund === undefined ? cancelled : `${cancelled} · ${refund}`;
  } else if (slip.status === "expired") {
    line = text.t("desk.slip.expired");
  } else if (slip.status === "awaiting_payment") {
    line = text.t("desk.slip.awaiting_payment");
  } else if (refund !== undefined) {
    line = refund;
    done = true;
  }
  words.textContent = line;
  words.classList.toggle("error", error);
  words.classList.toggle("done", done);
  const held = ui?.cancelling ?? ui?.refunding;
  keep.hidden = held === undefined;
  part(keep, ".slip-seconds").textContent =
    held === undefined ? "" : `${held.seconds} s`;
  const online =
    (ui?.refunding !== undefined && !paidByHand(slip, ui.handPaid)) ||
    ui?.refunded?.online === true;
  part(item, ".slip-prototype").hidden = !online || error;
}

// Only a stamp she has just made lands; a load or a live change does not move.
function land(stamp: HTMLElement): void {
  stamp.removeAttribute("data-landing");
  void stamp.offsetWidth;
  stamp.setAttribute("data-landing", "");
  stamp.addEventListener(
    "animationend",
    () => stamp.removeAttribute("data-landing"),
    { once: true },
  );
}

function setWords(element: HTMLElement, words: string): void {
  element.textContent = words;
  const language = languageOfText(words);
  if (language === undefined) element.removeAttribute("lang");
  else element.lang = language;
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The slip has no ${selector}.`);
  return found;
}
