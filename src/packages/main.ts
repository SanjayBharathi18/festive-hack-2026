import {
  cateringSwitchSchema,
  deskPackageAnswerSchema,
  deskPackagesSchema,
  type CateringPackage,
  type PackageInput,
} from "../../shared/catering.ts";
import { deskStoreSchema } from "../../shared/desk.ts";
import { createApi, isAbortError, isApiError } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import {
  offerLimits,
  offerMinimum,
  offerPrice,
  styleWords,
} from "../catering/offer-words.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { demoHeader, takeDemoToken } from "../desk/access.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import { createEditorView } from "./editor-view.ts";
import {
  emptyPackage,
  problemWords,
  readPackageForm,
  valuesOfPackage,
} from "./package-form.ts";

const text = await loadText();
for (const template of document.querySelectorAll("template")) {
  text.apply(template.content);
}
const { token, cleaned } = takeDemoToken(
  new URL(location.href),
  sessionStorage,
);
if (cleaned !== undefined) history.replaceState(null, "", cleaned);
const api = createApi({ headers: () => ({ [demoHeader]: token }) });
const el = <T extends Element>(id: string, type: abstract new () => T) =>
  find(document, id, type);
const sounds = createSounds({ store: storageOf(() => localStorage) });
bindSoundToggle(el("#sound-toggle", HTMLButtonElement), sounds, {
  on: text.t("sound.on"),
  off: text.t("sound.off"),
});
bindLanguagePicker(
  find(document, "#language-picker", HTMLSelectElement),
  text.language,
);
const editor = el("#editor", HTMLFormElement);
const fields = createEditorView(document);
const list = el("#packages", HTMLElement);
const switcher = el("#catering-on", HTMLInputElement);
const saveWait = createWait({
  control: el("#save", HTMLButtonElement),
  line: el("#save-wait", HTMLElement),
});
let packages: CateringPackage[] = [];
let editing: string | undefined;
let removed: PackageInput | undefined;

const show = (id: string, words: string) => {
  const target = el(id, HTMLElement);
  target.textContent = words;
  target.hidden = words === "";
};

function render(): void {
  el("#empty", HTMLElement).hidden = packages.length > 0;
  list.replaceChildren(
    ...packages.map((pkg) => {
      const item = cloneTemplate(el("#package-template", HTMLTemplateElement));
      find(item, ".package-name", HTMLElement).textContent = pkg.name;
      const price = find(item, ".package-price", HTMLElement);
      price.textContent = offerPrice(pkg, text);
      price.classList.toggle("num", pkg.price !== null);
      find(item, ".package-limits", HTMLElement).textContent = offerLimits(
        { ...pkg, limits: pkg.categories },
        text,
      );
      find(item, ".package-meta", HTMLElement).textContent = [
        offerMinimum(pkg, text),
        styleWords(pkg.service_styles, text),
      ].join(" · ");
      const edit = find(item, ".package-edit", HTMLButtonElement);
      edit.setAttribute(
        "aria-label",
        text.t("catering.editor.edit_named", { name: pkg.name }),
      );
      edit.addEventListener("click", () => open(pkg));
      const remove = find(item, ".package-remove", HTMLButtonElement);
      remove.setAttribute(
        "aria-label",
        text.t("catering.editor.remove_named", { name: pkg.name }),
      );
      remove.addEventListener("click", () => void removePackage(pkg));
      return item;
    }),
  );
}

function open(pkg: CateringPackage | undefined): void {
  editing = pkg?.id;
  fields.fill(pkg === undefined ? emptyPackage() : valuesOfPackage(pkg));
  el("#editor-title", HTMLElement).textContent =
    pkg === undefined
      ? text.t("catering.editor.form_new")
      : text.t("catering.editor.form_edit", { name: pkg.name });
  show("#editor-error", "");
  editor.hidden = false;
  el("#name", HTMLInputElement).focus();
}

function notice(words: string, undo: boolean): void {
  show("#notice-words", words);
  el("#notice", HTMLElement).hidden = words === "";
  el("#undo", HTMLButtonElement).hidden = !undo;
}

async function removePackage(pkg: CateringPackage): Promise<void> {
  const before = packages;
  packages = packages.filter(({ id }) => id !== pkg.id);
  render();
  try {
    await api.send(
      "DELETE",
      `/api/desk/packages/${pkg.id}`,
      undefined,
      deskPackageAnswerSchema,
    );
    const values = readPackageForm(valuesOfPackage(pkg));
    removed = values.ok ? values.input : undefined;
    notice(
      text.t("catering.editor.removed", { name: pkg.name }),
      removed !== undefined,
    );
  } catch (error) {
    packages = before;
    render();
    show("#list-error", text.error(error, "catering.editor"));
  }
}

editor.addEventListener("submit", (event) => {
  event.preventDefault();
  if (saveWait.running) return;
  const values = fields.read();
  const read = readPackageForm(values);
  if (!read.ok) {
    show("#editor-error", problemWords(read, values, text));
    fields.focus(read.at);
    return;
  }
  show("#editor-error", "");
  void saveWait
    .run(
      (signal) =>
        editing === undefined
          ? api.send(
              "POST",
              "/api/desk/packages",
              read.input,
              deskPackageAnswerSchema,
              { signal },
            )
          : api.send(
              "PUT",
              `/api/desk/packages/${editing}`,
              read.input,
              deskPackageAnswerSchema,
              { signal },
            ),
      text.t("catering.editor.saving"),
    )
    .then(({ package: saved }) => {
      packages = packages.some(({ id }) => id === saved.id)
        ? packages.map((pkg) => (pkg.id === saved.id ? saved : pkg))
        : [...packages, saved];
      render();
      editor.hidden = true;
      notice(text.t("catering.editor.saved", { name: saved.name }), false);
    })
    .catch((error: unknown) => {
      if (!isAbortError(error))
        show("#editor-error", text.error(error, "catering.editor"));
    });
});
el("#cancel", HTMLButtonElement).addEventListener("click", () => {
  editor.hidden = true;
});
el("#add", HTMLButtonElement).addEventListener("click", () => open(undefined));
el("#undo", HTMLButtonElement).addEventListener("click", () => {
  const input = removed;
  if (input === undefined) return;
  removed = undefined;
  notice("", false);
  void api
    .send("POST", "/api/desk/packages", input, deskPackageAnswerSchema)
    .then(({ package: back }) => {
      packages = [...packages, back];
      render();
    })
    .catch((error: unknown) =>
      show("#list-error", text.error(error, "catering.editor")),
    );
});
switcher.addEventListener("change", () => {
  const on = switcher.checked;
  show(
    "#switch-status",
    text.t(on ? "catering.editor.switch_on" : "catering.editor.switch_off"),
  );
  void api
    .send(
      "PUT",
      "/api/desk/catering",
      { catering_on: on },
      cateringSwitchSchema,
    )
    .catch((error: unknown) => {
      switcher.checked = !on;
      show("#switch-status", text.error(error, "catering.editor"));
    });
});

try {
  const loadWait = createWait({
    control: el("#page", HTMLElement),
    line: el("#load-wait", HTMLElement),
  });
  const [desk, answer] = await loadWait.run(
    (signal) =>
      Promise.all([
        api.get("/api/desk/store", deskStoreSchema, { signal }),
        api.get("/api/desk/packages", deskPackagesSchema, { signal }),
      ]),
    text.t("catering.editor.loading"),
  );
  el("#store-name", HTMLElement).textContent = desk.store.name;
  el("#demo-badge", HTMLElement).hidden = !desk.store.is_demo;
  packages = answer.packages;
  switcher.checked = answer.catering_on;
  show(
    "#switch-status",
    text.t(
      answer.catering_on
        ? "catering.editor.switch_on"
        : "catering.editor.switch_off",
    ),
  );
  render();
  el("#editor-page", HTMLElement).hidden = false;
} catch (error) {
  show(
    "#load-error",
    isApiError(error) && error.code === "not_signed_in"
      ? text.t("catering.editor.sign_in")
      : text.error(error, "catering.editor"),
  );
  el("#load-problem", HTMLElement).hidden = false;
}
