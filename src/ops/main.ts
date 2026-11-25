import {
  opsFlagsSchema,
  opsSarvamSchema,
  opsStateSchema,
} from "../../shared/ops.ts";
import { createApi, isApiError } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { demoHeader, takeDemoToken } from "../desk/access.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import type { TextKey } from "../text/text.ts";
import { createFlagsView, flagsEverySeconds } from "./flags-view.ts";
import { createOpsView, type Place } from "./ops-view.ts";
import { createPoll } from "./poll.ts";
import { createSarvamView, sarvamEverySeconds } from "./sarvam-view.ts";
import { bindSections, firstSection, type Section } from "./sections.ts";

const pollMs = 2000;

const { token, cleaned } = takeDemoToken(
  new URL(location.href),
  sessionStorage,
);
if (cleaned !== undefined) history.replaceState(history.state, "", cleaned);
const api = createApi({ headers: () => ({ [demoHeader]: token }) });
const text = await loadText();
text.apply(document);
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
const view = createOpsView(document, text);
const flagsView = createFlagsView(document, text);
const sarvamView = createSarvamView(document, text);
const consoleRoot = find(document, "#ops-console", HTMLElement);
const problem = find(document, "#open-problem", HTMLElement);
const status = find(document, "#state-wait [role=status]", HTMLElement);
const showProblem = (words: string) => {
  status.textContent = "";
  consoleRoot.hidden = true;
  problem.hidden = false;
  find(problem, "#open-error", HTMLElement).textContent = words;
};
// A token that the server does not know is not_signed_in, and a seller's own
// session is forbidden. Both close the console.
const closesConsole = (error: unknown): boolean => {
  if (
    !isApiError(error) ||
    (error.code !== "not_signed_in" && error.code !== "forbidden")
  ) {
    return false;
  }
  showProblem(
    error.code === "forbidden"
      ? text.t("ops.demo_only")
      : text.error(error, "ops"),
  );
  return true;
};

// The console opens only with the demo desk token. A tab without it asks
// for the demo desk link and does not call the server.
if (token === undefined) {
  showProblem(text.t("ops.error.not_signed_in"));
} else {
  status.textContent = text.t("ops.opening");
  let shown: Section = firstSection;
  const statePoll = createPoll({
    everyMs: pollMs,
    visibility: document,
    load: async (signal) => {
      try {
        const state = await api.get("/api/ops/state", opsStateSchema, {
          signal,
        });
        status.textContent = "";
        problem.hidden = true;
        consoleRoot.hidden = false;
        view.show(state);
        view.stale(null);
      } catch (error) {
        if (signal.aborted) return;
        status.textContent = "";
        if (!closesConsole(error)) view.stale(text.error(error, "ops"));
      }
    },
  });
  // Each section loads when it shows, then again while it stays in view.
  const flagsPoll = createPoll({
    everyMs: flagsEverySeconds * 1000,
    visibility: document,
    load: async (signal) => {
      if (shown !== "flagsmith") return;
      try {
        flagsView.show(
          await api.get("/api/ops/flags", opsFlagsSchema, { signal }),
        );
      } catch (error) {
        if (signal.aborted || closesConsole(error)) return;
        flagsView.problem(text.error(error, "ops"));
      }
    },
  });
  const sarvamPoll = createPoll({
    everyMs: sarvamEverySeconds * 1000,
    visibility: document,
    load: async (signal) => {
      if (shown !== "sarvam") return;
      try {
        sarvamView.show(
          await api.get("/api/ops/sarvam", opsSarvamSchema, { signal }),
        );
      } catch (error) {
        if (signal.aborted || closesConsole(error)) return;
        sarvamView.problem(text.error(error, "ops"));
      }
    },
  });
  bindSections({
    radios: [
      ...document.querySelectorAll<HTMLInputElement>('input[name="section"]'),
    ],
    panel: (section) => find(document, `#section-${section}`, HTMLElement),
    hash: location.hash,
    keepHash: (hash) => history.replaceState(history.state, "", hash),
    onShow: (section) => {
      shown = section;
      if (section === "flagsmith") void flagsPoll.now();
      if (section === "sarvam") void sarvamPoll.now();
    },
  });
  void statePoll.now();
}

const actions: [string, string, Place, TextKey | null][] = [
  ["#approve", "/api/ops/approve", "decision", null],
  ["#reject", "/api/ops/reject", "decision", null],
  ["#trigger", "/api/ops/trigger", "control", "ops.controls.trigger_done"],
  ["#reset", "/api/ops/reset", "control", "ops.controls.reset_done"],
];
for (const [selector, path, place, done] of actions) {
  const button = find(document, selector, HTMLButtonElement);
  button.addEventListener("click", async () => {
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    try {
      view.show(await api.send("POST", path, {}, opsStateSchema));
      view.result(place, done, null);
    } catch (error) {
      view.result(place, null, text.error(error, "ops"));
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  });
}
