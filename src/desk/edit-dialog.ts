import type { Day } from "../../shared/day.ts";
import type { DeskStore } from "../../shared/desk.ts";
import type {
  DayWarning,
  DeskDayCheckBody,
  DeskSlip,
} from "../../shared/orders.ts";
import { isAbortError } from "../api/api.ts";
import type { Sounds } from "../sound/engine.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { dayName } from "./board-view.ts";
import { noticeFromWarning, noticeWords } from "./day-notice.ts";
import {
  emptyDraft,
  orderFields,
  valuesFromSlip,
  type OrderFields,
} from "./draft.ts";
import { cartLoad } from "./load.ts";
import { createOrderForm } from "./order-form.ts";
import type { SlipActions } from "./slip-actions.ts";

export type EditDialog = { open(slip: DeskSlip): void };

export type CheckDay = (
  orderId: string,
  body: DeskDayCheckBody,
  signal: AbortSignal,
) => Promise<{ warning: DayWarning | null }>;

// Change a saved order. The day is checked first: a change that breaks the
// daily limit saves nothing yet, and the notice names the next day with
// space. She decides: save it anyway, or move it there. Esc and Close change
// nothing. A saved change has Undo on its slip.
export function createEditDialog({
  dialog,
  text,
  desk,
  today,
  latinNames,
  templates,
  actions,
  checkDay,
  sounds,
}: {
  dialog: HTMLDialogElement;
  text: Text;
  desk: DeskStore;
  today: () => Day | undefined;
  latinNames: ReadonlyMap<string, string | null>;
  templates: { form: HTMLTemplateElement; pack: HTMLTemplateElement };
  actions: Pick<SlipActions, "edit">;
  checkDay: CheckDay;
  sounds: Pick<Sounds, "tick" | "limit" | "settle" | "error">;
}): EditDialog {
  const { store } = desk;
  const formElement = part<HTMLFormElement>(dialog, "#edit-form");
  const notice = part(dialog, "#edit-notice");
  const error = part(dialog, "#edit-error");
  const move = part<HTMLButtonElement>(dialog, "#edit-move");
  const keep = part<HTMLButtonElement>(dialog, "#edit-keep");
  const save = part<HTMLButtonElement>(dialog, "#edit-save");
  const wait = createWait({
    control: save,
    line: dialog.querySelector("#edit-wait"),
  });
  const form = createOrderForm({
    template: templates.form,
    packTemplate: templates.pack,
    prefix: "edit",
    text,
    menu: desk.menu,
    store: {
      unit: store.limit_unit,
      limit: store.daily_limit,
      offersPickup: store.offers_pickup,
      offersDelivery: store.offers_delivery,
    },
    latinNames,
    sounds,
    onChange: () => {
      notice.hidden = true;
    },
  });
  part(dialog, "#edit-fields").append(form.element);
  let slip: DeskSlip | undefined;
  let busy = false;

  const failed = (failure: unknown) => {
    if (isAbortError(failure)) return;
    sounds.error();
    error.textContent = text.error(failure, "desk");
    error.hidden = false;
  };

  const send = async (fields: OrderFields, day: Day) => {
    const order = slip;
    if (order === undefined || busy) return;
    busy = true;
    error.hidden = true;
    try {
      await wait.run(
        () =>
          actions.edit(order.id, {
            action: "edit",
            ...fields,
            day,
            buyer_phone: order.buyer_phone,
          }),
        text.t("desk.edit.saving"),
      );
      sounds.settle();
      dialog.close();
    } catch (failure) {
      failed(failure);
    } finally {
      busy = false;
    }
  };

  const warn = (warning: DayWarning) => {
    sounds.limit();
    const words = noticeWords(noticeFromWarning(warning), {
      need: cartLoad(store.limit_unit, form.values.lines),
      unit: store.limit_unit,
      text,
      dayName: (each) => dayName(each, today(), text),
    });
    part(notice, ".notice-text").textContent = words.problem;
    part(notice, ".notice-next").textContent = words.next;
    move.hidden = warning.next_free_day === null;
    move.dataset.day = warning.next_free_day ?? "";
    notice.hidden = false;
    notice.scrollIntoView({ block: "nearest" });
    (move.hidden ? keep : move).focus();
  };

  // A check that fails does not block the save: the server checks again.
  const checkThenSend = async () => {
    const order = slip;
    const fields = orderFields(form.values);
    if (order === undefined || fields === undefined || busy) return;
    busy = true;
    error.hidden = true;
    let warning: DayWarning | null = null;
    try {
      ({ warning } = await wait.run(
        (signal) =>
          checkDay(order.id, { day: fields.day, cart: fields.cart }, signal),
        text.t("desk.edit.checking"),
      ));
    } catch (failure) {
      if (isAbortError(failure)) {
        busy = false;
        return;
      }
      console.error("The day check of the change failed.", failure);
    }
    busy = false;
    if (warning === null) await send(fields, fields.day);
    else warn(warning);
  };

  formElement.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.check()) void checkThenSend();
  });
  move.addEventListener("click", () => {
    const fields = orderFields(form.values);
    const day = move.dataset.day;
    if (fields !== undefined && day) void send(fields, day);
  });
  keep.addEventListener("click", () => {
    const fields = orderFields(form.values);
    if (fields !== undefined) void send(fields, fields.day);
  });
  for (const close of dialog.querySelectorAll("[data-close]")) {
    close.addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("close", () => wait.cancel());

  return {
    open(next) {
      slip = next;
      part(dialog, "#edit-number").textContent = String(next.number);
      const day = today();
      if (day !== undefined) form.setToday(day);
      form.show(emptyDraft(), "fill", valuesFromSlip(next));
      notice.hidden = true;
      error.hidden = true;
      dialog.showModal();
    },
  };
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Change order has no ${selector}.`);
  return found;
}
