import { cancelReasonSchema, type DeskSlip } from "../../shared/orders.ts";
import type { Text } from "../text/text.ts";
import type { SlipActions } from "./slip-actions.ts";

export type CancelDialog = { open(slip: DeskSlip): void };

// She picks one of the four reasons. The slip then holds the cancel back
// for 10 s with Undo, because a cancel is final on the server.
export function createCancelDialog({
  dialog,
  text,
  actions,
}: {
  dialog: HTMLDialogElement;
  text: Text;
  actions: Pick<SlipActions, "cancel">;
}): CancelDialog {
  const form = part<HTMLFormElement>(dialog, "#cancel-form");
  const radios = [
    ...form.querySelectorAll<HTMLInputElement>("input[name=reason]"),
  ];
  const first = radios[0];
  let slip: DeskSlip | undefined;

  first?.addEventListener("invalid", () => {
    first.setCustomValidity(text.t("desk.cancel.pick_reason"));
  });
  for (const radio of radios) {
    radio.addEventListener("change", () => first?.setCustomValidity(""));
  }
  dialog.addEventListener("close", () => {
    const order = slip;
    slip = undefined;
    if (order === undefined || dialog.returnValue !== "cancel") return;
    const reason = cancelReasonSchema.safeParse(
      new FormData(form).get("reason"),
    );
    if (reason.success) actions.cancel(order.id, reason.data);
  });

  return {
    open(next) {
      slip = next;
      form.reset();
      first?.setCustomValidity("");
      dialog.returnValue = "";
      part(dialog, "#cancel-number").textContent = String(next.number);
      part(dialog, "#cancel-hint").hidden =
        next.source === "desk" || next.source === "load";
      dialog.showModal();
    },
  };
}

function part<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Cancel order has no ${selector}.`);
  return found;
}
