import {
  boardPostPageSchema,
  workEmailSchema,
  type BoardPostPage,
  type BoardPostPatch,
} from "../../shared/bulk.ts";
import { addDays, istDay } from "../../shared/day.ts";
import { phoneSchema } from "../../shared/phone.ts";
import { createApi, isAbortError } from "../api/api.ts";
import { createCityPicker } from "../app-bar/city-picker.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { find } from "../dom/dom.ts";
import { createContactDialog } from "../quotes/contact-dialog.ts";
import { amountWords } from "../quotes/summary.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import { createBoardFlow } from "./board-flow.ts";
import { formValuesOf, readBoardForm } from "./board-form.ts";
import { createBoardFormView, showPost } from "./board-view.ts";

const text = await loadText();
for (const template of document.querySelectorAll("template")) {
  text.apply(template.content);
}
const sounds = createSounds({ store: storageOf(() => localStorage) });
bindSoundToggle(find(document, "#sound-toggle", HTMLButtonElement), sounds, {
  on: text.t("sound.on"),
  off: text.t("sound.off"),
});
bindLanguagePicker(
  find(document, "#language-picker", HTMLSelectElement),
  text.language,
);
const api = createApi();
const el = <T extends Element>(id: string, type: abstract new () => T) =>
  find(document, id, type);
const token = decodeURIComponent(location.pathname.split("/")[2] ?? "");
const picker = createCityPicker({
  select: el("#city-picker", HTMLSelectElement),
  api,
  language: text.language,
  storage: storageOf(() => localStorage),
  onChange: followCity,
});
let pickedCity = picker.label(picker.current());
const form = el("#form", HTMLFormElement);
const view = el("#view", HTMLElement);
const submit = el("#submit", HTMLButtonElement);
const formError = el("#form-error", HTMLElement);
const email = el("#email", HTMLInputElement);
const phone = el("#phone", HTMLInputElement);
const fields = createBoardFormView(document);
const flow = createBoardFlow({ api });
const dialog = createContactDialog({ api, text, sounds });
const submitWait = createWait({
  control: submit,
  line: el("#submit-wait", HTMLElement),
});
const loadWait = createWait({
  control: el("#page", HTMLElement),
  line: el("#load-wait", HTMLElement),
});
let page: BoardPostPage | undefined;
let editing = false;

const showError = (target: HTMLElement, words: string) => {
  target.textContent = words;
  target.hidden = words === "";
};

function showForm(mode: "new" | "edit"): void {
  editing = mode === "edit";
  view.hidden = true;
  form.hidden = false;
  el("#form-title", HTMLElement).textContent = text.t(
    editing ? "board_post.edit_title" : "board_post.new_title",
  );
  el("#form-lead", HTMLElement).hidden = editing;
  for (const id of ["#email", "#phone"]) {
    find(document, id, HTMLInputElement)
      .closest(".field")
      ?.toggleAttribute("hidden", editing);
  }
  el("#verify-title", HTMLElement).textContent = text.t(
    editing ? "board_post.save_title" : "board_post.verify",
  );
  el("#cancel", HTMLButtonElement).hidden = !editing;
  const today = page?.today ?? istDay(Date.now());
  el("#need-by", HTMLInputElement).min = today;
  el("#need-by", HTMLInputElement).max = addDays(today, 180);
  showError(formError, "");
  renderSubmit();
}

function renderSubmit(): void {
  const codes = flow.codes;
  el("#codes", HTMLElement).hidden = editing || codes === undefined;
  el("#email-code-value", HTMLElement).textContent =
    codes?.emailCode.code ?? "";
  el("#phone-code-value", HTMLElement).textContent =
    codes?.phoneCode.code ?? "";
  submit.textContent = text.t(
    editing
      ? "board_post.save"
      : codes === undefined
        ? "board_post.get_codes"
        : "board_post.post",
  );
}

function showView(next: BoardPostPage, notice = ""): void {
  page = next;
  editing = false;
  form.hidden = true;
  view.hidden = false;
  showPost(document, next, text, (interest) =>
    dialog.open({
      store: interest.store.name,
      lines: [
        next.post.company_name ?? next.post.description,
        ...next.post.items.map(({ name, quantity, unit }) =>
          text.t("quotes.summary.board_line", {
            name,
            amount: amountWords(quantity, unit, text),
          }),
        ),
      ],
      request: {
        kind: "board_post",
        store_id: interest.store.id,
        board_post: next.token,
      },
    }),
  );
  showNotice(notice, false);
}

function showNotice(words: string, undo: boolean): void {
  showError(el("#post-error", HTMLElement), "");
  el("#post-notice", HTMLElement).hidden = words === "";
  el("#post-notice-words", HTMLElement).textContent = words;
  el("#undo", HTMLButtonElement).hidden = !undo;
}

// A new post is for the city of the picker, until the company types another.
function followCity(city: string): void {
  const field = el("#city", HTMLInputElement);
  const label = picker.label(city);
  if (token === "new" && !editing && field.value.trim() === pickedCity) {
    field.value = label;
  }
  pickedCity = label;
}

// The link of the post on show: after a new post, the address says "new"
// no more, and the page has the token of the post.
async function patch(body: BoardPostPatch): Promise<BoardPostPage> {
  if (page === undefined) throw new Error("No board post is on show.");
  return api.send(
    "PATCH",
    `/api/board-posts/${encodeURIComponent(page.token)}`,
    body,
    boardPostPageSchema,
  );
}

async function onSubmit(): Promise<void> {
  const today = page?.today ?? istDay(Date.now());
  const read = readBoardForm(fields.read(), today);
  if (!read.ok) {
    showError(formError, text.t(`board_post.problem.${read.problem}`));
    return;
  }
  if (editing) {
    const saved = await submitWait.run(
      () => patch({ action: "edit", post: read.fields }),
      text.t("board_post.saving"),
    );
    showView(saved, text.t("board_post.saved"));
    return;
  }
  if (!workEmailSchema.safeParse(email.value).success) {
    showError(formError, text.t("board_post.problem.email"));
    email.focus();
    return;
  }
  if (!phoneSchema.safeParse(phone.value).success) {
    showError(formError, text.t("board_post.problem.phone"));
    phone.focus();
    return;
  }
  if (flow.codes === undefined) {
    await submitWait.run(
      (signal) => flow.getCodes(email.value, phone.value, signal),
      text.t("board_post.getting_codes"),
    );
    renderSubmit();
    el("#email-code", HTMLInputElement).focus();
    return;
  }
  const emailCode = el("#email-code", HTMLInputElement).value;
  const phoneCode = el("#phone-code", HTMLInputElement).value;
  if (
    ![emailCode, phoneCode].every((code) =>
      /^\d{6}$/.test(code.replace(/\s/g, "")),
    )
  ) {
    showError(formError, text.t("board_post.problem.codes"));
    return;
  }
  const posted = await submitWait.run(
    (signal) =>
      flow.post(
        read.fields,
        { email: email.value, phone: phone.value, emailCode, phoneCode },
        text.language,
        signal,
      ),
    text.t("board_post.posting"),
  );
  sounds.commit();
  history.replaceState(
    null,
    "",
    `/board-posts/${encodeURIComponent(posted.token)}`,
  );
  showView(posted, text.t("board_post.posted"));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (submitWait.running) return;
  showError(formError, "");
  void onSubmit().catch((error) => {
    if (isAbortError(error)) return;
    sounds.error();
    renderSubmit();
    showError(formError, text.error(error, "board_post"));
  });
});
for (const input of [email, phone]) {
  input.addEventListener("input", () => {
    if (flow.changed(email.value, phone.value)) renderSubmit();
  });
}
el("#edit", HTMLButtonElement).addEventListener("click", () => {
  if (page === undefined) return;
  fields.fill(formValuesOf(page.post));
  showForm("edit");
  el("#description", HTMLInputElement).focus();
});
el("#cancel", HTMLButtonElement).addEventListener("click", () => {
  if (page !== undefined) showView(page);
});
const change = (body: BoardPostPatch, notice: string, undo: boolean) =>
  void patch(body)
    .then((next) => {
      showView(next);
      showNotice(notice, undo);
    })
    .catch((error) => {
      sounds.error();
      showError(
        el("#post-error", HTMLElement),
        text.error(error, "board_post"),
      );
    });
el("#close", HTMLButtonElement).addEventListener("click", () => {
  sounds.cancel();
  change({ action: "close" }, text.t("board_post.closed_notice"), true);
});
el("#undo", HTMLButtonElement).addEventListener("click", () => {
  sounds.undo();
  change({ action: "reopen" }, text.t("board_post.reopened"), false);
});
el("#reopen", HTMLButtonElement).addEventListener("click", () =>
  change({ action: "reopen" }, text.t("board_post.reopened"), false),
);

if (token === "new") {
  fields.fill({
    company: "",
    description: "",
    items: [],
    needBy: "",
    places: [],
    budget: "",
    city: pickedCity,
  });
  showForm("new");
} else {
  try {
    const loaded = await loadWait.run(
      (signal) =>
        api.get(
          `/api/board-posts/${encodeURIComponent(token)}`,
          boardPostPageSchema,
          {
            signal,
          },
        ),
      text.t("board_post.loading"),
    );
    showView(loaded);
  } catch (error) {
    showError(el("#load-error", HTMLElement), text.error(error, "board_post"));
    el("#load-problem", HTMLElement).hidden = false;
  }
}
