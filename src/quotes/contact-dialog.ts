import { phoneSchema } from "../../shared/phone.ts";
import type { QuoteAnswer, QuoteInput } from "../../shared/quotes.ts";
import { isAbortError, type Api } from "../api/api.ts";
import { find } from "../dom/dom.ts";
import type { Sounds } from "../sound/engine.ts";
import { leaveWithSound } from "../sound/leave.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import { createContactFlow } from "./contact-flow.ts";
import "./contact-dialog.css";
import html from "./contact-dialog.html?raw";
import { fromHtml } from "./fragment.ts";
import { quoteSummary, waLink } from "./summary.ts";

// What the buyer asks for: the request without the fields that the dialog
// asks (the note, and for a bulk cart the need-by day and the place), and
// the lines that sum it up. names: the item names that the buyer reads, by
// item id, for the WhatsApp message.
export type ContactRequest = {
  store: string;
  lines: readonly string[];
  request: QuoteInput;
  names?: ReadonlyMap<string, string>;
};

// whatsapp: the link of Send on WhatsApp, with the summary of the request.
export type ContactSent = (answer: QuoteAnswer, whatsapp: string) => void;

// returnTo: the focus after the dialog closes, when the control that opened
// it is gone, for example the Contact seller of a bulk cart that was sent.
export type ContactDialog = {
  open(
    request: ContactRequest,
    onSent?: ContactSent,
    returnTo?: HTMLElement,
  ): void;
};

// The sounds of the dialog: commit when the seller has the request, and
// before WhatsApp opens; error when a step fails.
export type ContactSounds = Pick<Sounds, "commit" | "error">;

export function createContactDialog({
  api,
  text,
  sounds,
}: {
  api: Api;
  text: Text;
  sounds: ContactSounds;
}): ContactDialog {
  const dialog = fromHtml(html, text);
  if (!(dialog instanceof HTMLDialogElement)) {
    throw new Error("The contact markup has no dialog.");
  }
  document.body.append(dialog);
  const el = <T extends Element>(
    selector: string,
    type: abstract new () => T,
  ) => find(dialog, selector, type);
  const form = el(".contact-form", HTMLFormElement);
  const store = el(".contact-store", HTMLElement);
  const lines = el(".contact-lines", HTMLElement);
  const ask = el(".contact-ask", HTMLElement);
  const bulk = el(".contact-bulk", HTMLFieldSetElement);
  const needBy = el(".contact-need-by", HTMLInputElement);
  const place = el(".contact-place", HTMLInputElement);
  const note = el(".contact-note", HTMLTextAreaElement);
  const name = el(".contact-name", HTMLInputElement);
  const phone = el(".contact-phone", HTMLInputElement);
  const codeStep = el(".contact-code", HTMLElement);
  const codeValue = el(".code-value", HTMLElement);
  const code = el(".contact-code-input", HTMLInputElement);
  const error = el(".contact-error", HTMLElement);
  const go = el(".contact-go", HTMLButtonElement);
  const done = el(".contact-done", HTMLElement);
  const whatsapp = el(".contact-whatsapp", HTMLAnchorElement);
  const flow = createContactFlow({ api });
  const wait = createWait({
    control: go,
    line: el(".contact-wait", HTMLElement),
  });
  let current: ContactRequest | undefined;
  let sentTo: ContactSent | undefined;
  let opener: Element | null = null;
  let fallback: HTMLElement | undefined;
  el(".contact-consent-words", HTMLElement).textContent = text.t(
    "quotes.dialog.consent",
    { product: text.t("common.product") },
  );

  const showError = (words: string) => {
    error.textContent = words;
    error.hidden = words === "";
  };

  const render = () => {
    const sent = flow.phase === "sent";
    ask.hidden = sent;
    done.hidden = !sent;
    codeStep.hidden = flow.phase !== "code";
    code.required = flow.phase === "code";
    codeValue.textContent = flow.code?.code ?? "";
    go.textContent = text.t(
      flow.phase === "code" ? "quotes.dialog.send" : "quotes.dialog.send_code",
    );
  };

  const request = (): QuoteInput | undefined => {
    if (current === undefined) return undefined;
    const base = { ...current.request, note: note.value.trim() || null };
    return base.kind === "bulk"
      ? {
          ...base,
          need_by: needBy.value === "" ? null : needBy.value,
          place: place.value.trim() || null,
        }
      : base;
  };

  const sendCode = async () => {
    if (name.value.trim() === "") {
      showError(text.t("quotes.error.name_missing"));
      name.focus();
      return;
    }
    if (!phoneSchema.safeParse(phone.value).success) {
      showError(text.t("quotes.error.phone_invalid"));
      phone.focus();
      return;
    }
    await wait.run(
      (signal) => flow.sendCode(phone.value, signal),
      text.t("quotes.dialog.sending_code"),
    );
    render();
    code.focus();
  };

  const send = async () => {
    const body = request();
    if (body === undefined) return;
    if (!/^\d{6}$/.test(code.value.replace(/\s/g, ""))) {
      showError(text.t("quotes.error.code_missing"));
      code.focus();
      return;
    }
    const answer = await wait.run(
      (signal) =>
        flow.send(
          {
            buyer_name: name.value.trim(),
            language: text.language,
            request: body,
          },
          { phone: phone.value, code: code.value },
          signal,
        ),
      text.t("quotes.dialog.sending"),
    );
    whatsapp.href = waLink(
      answer.seller_phone,
      quoteSummary(
        answer.request,
        {
          store: answer.store.name,
          buyer: name.value.trim(),
          ...(current?.names === undefined ? {} : { names: current.names }),
        },
        text,
      ),
    );
    sounds.commit();
    render();
    whatsapp.focus();
    sentTo?.(answer, whatsapp.href);
  };
  whatsapp.addEventListener("click", (event) =>
    leaveWithSound(event, whatsapp, () => sounds.commit()),
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (wait.running) return;
    showError("");
    void (flow.phase === "code" ? send() : sendCode()).catch((problem) => {
      if (isAbortError(problem)) return;
      sounds.error();
      render();
      showError(text.error(problem, "quotes"));
    });
  });
  phone.addEventListener("input", () => {
    if (flow.phoneChanged(phone.value)) render();
  });
  el(".contact-new-code", HTMLButtonElement).addEventListener("click", () => {
    flow.reset();
    code.value = "";
    showError("");
    void sendCode().catch((problem) =>
      showError(text.error(problem, "quotes")),
    );
  });
  for (const close of dialog.querySelectorAll(
    ".contact-close, .contact-done-close",
  )) {
    close.addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("close", () => {
    wait.cancel();
    if (opener !== null && !opener.isConnected) fallback?.focus();
  });

  return {
    open(next, onSent, returnTo) {
      opener = document.activeElement;
      fallback = returnTo;
      current = next;
      sentTo = onSent;
      if (flow.phase === "sent") flow.reset();
      code.value = "";
      note.value = "";
      store.textContent = next.store;
      bulk.hidden = next.request.kind !== "bulk";
      needBy.min = new Date().toISOString().slice(0, 10);
      lines.replaceChildren(
        ...next.lines.map((line) => {
          const item = document.createElement("li");
          item.textContent = line;
          return item;
        }),
      );
      showError("");
      render();
      dialog.showModal();
      (name.value === "" ? name : note).focus();
    },
  };
}
