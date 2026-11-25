import { addDays } from "../../shared/day.ts";
import { festivalWindowDays } from "../../shared/festivals.ts";
import {
  searchAnswerSchema,
  searchSpeechAnswerSchema,
  type SearchAnswer,
  type SearchSpeechAnswer,
} from "../../shared/search.ts";
import { createApi } from "../api/api.ts";
import { createCityPicker } from "../app-bar/city-picker.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { showVoiceMeter } from "../buyer/voice-meter.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";
import { prepareVoice } from "../voice/prepare.ts";
import { createRecorder, type RecorderPhase } from "../voice/recorder.ts";
import { createVoiceFlow } from "../voice/voice-flow.ts";
import { createWait } from "../wait/wait.ts";
import { mountBulkPanel } from "./bulk-panel.ts";
import { mountCateringPanel } from "./catering-panel.ts";
import { isLocateError, locate, type Located } from "./locate.ts";
import { createResultsView } from "./results-view.ts";
import { bindSearchField } from "./search-field.ts";
import {
  fieldsOf,
  filtersOn,
  keptFields,
  pageQuery,
  searchPath,
} from "./search-request.ts";
import { createSearchRuns } from "./search-runs.ts";
import { sortNote } from "./sort-note.ts";
import { createTabs, hashOfTab, tabFromHash, type TabName } from "./tabs.ts";

const speechTimeoutMs = 60_000;

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
const el = (id: string) => find(document, id, HTMLElement);
const form = find(document, "#search-form", HTMLFormElement);
const query = find(document, "#q", HTMLInputElement);
const needBy = find(document, "#need-by", HTMLInputElement);
const nearest = find(document, "#sort-distance", HTMLInputElement);
const mic = find(document, "#mic", HTMLButtonElement);
const locationButton = find(document, "#use-location", HTMLButtonElement);
const tabChoices = find(document, "#tabs", HTMLFieldSetElement);
const leaving = new AbortController();
addEventListener("pagehide", (event) => {
  if (!event.persisted) leaving.abort();
});
let located: { place: Located; city: string } | null = null;
let first = true;
const sortLine = el("#sort-note");
const picker = createCityPicker({
  select: find(document, "#city-picker", HTMLSelectElement),
  api,
  language: text.language,
  storage: storageOf(() => localStorage),
  onChange: cityChanged,
  signal: leaving.signal,
});

const panels = {
  food: el("#food"),
  bulk: el("#bulk"),
  catering: el("#catering"),
};
const panelCities = new Map<TabName, { city: string; stop: AbortController }>();
// A panel loads again when it shows after a change of city.
const mountPanel = (tab: TabName) => {
  const city = picker.current();
  const mounted = panelCities.get(tab);
  if (tab === "food" || mounted?.city === city) return;
  mounted?.stop.abort();
  const stop = new AbortController();
  panelCities.set(tab, { city, stop });
  const signal = AbortSignal.any([leaving.signal, stop.signal]);
  if (tab === "bulk") mountBulkPanel(panels.bulk, signal, sounds, text, city);
  else mountCateringPanel(panels.catering, signal, text, city);
};
const tabs = createTabs({ panels, onFirstShow: mountPanel });
const show = (tab: TabName) => {
  tabs.show(tab);
  mountPanel(tab);
};
const choose = (tab: TabName) => {
  const input = tabChoices.querySelector<HTMLInputElement>(
    `input[value="${tab}"]`,
  );
  if (input !== null) input.checked = true;
  show(tab);
};
tabChoices.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  const tab = tabFromHash(`#${event.target.value}`);
  show(tab);
  history.replaceState(
    null,
    "",
    hashOfTab(tab) || `${location.pathname}${location.search}`,
  );
});
addEventListener("hashchange", () => choose(tabFromHash(location.hash)));
choose(tabFromHash(location.hash));

for (const [name, value] of keptFields(location.search)) {
  const field = form.elements.namedItem(name);
  if (field instanceof RadioNodeList || field instanceof HTMLInputElement) {
    field.value = value;
  }
}

const view = createResultsView(document, text);
const filterCount = el("#filters-count");
const filterNumber = el("#filters-number");
const filtersOnWords = el("#filters-on");
// The Filters button says how many filters are on, in plain words: it is
// not an unread count.
const showFilterCount = () => {
  const data = new FormData(form);
  const count = filtersOn(fieldsOf((name) => data.get(name)));
  filterCount.hidden = count === 0;
  filterNumber.textContent = String(count);
  filtersOnWords.textContent =
    count === 0 ? "" : text.t("search.filters.on", { count });
};
showFilterCount();
const runs = createSearchRuns<SearchAnswer>({
  wait: createWait({ control: el("#results"), line: el("#load-wait") }),
  words: text.t("search.loading"),
  read: (signal) => {
    const data = new FormData(form);
    const fields = fieldsOf((name) => data.get(name));
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${pageQuery(fields, location.search)}${location.hash}`,
    );
    const city = picker.current();
    const place = located?.city === city ? located.place : null;
    return api.get(searchPath(fields, place, city), searchAnswerSchema, {
      signal: AbortSignal.any([signal, leaving.signal]),
    });
  },
  onAnswer(answer) {
    if (first) {
      first = false;
      mic.hidden = !answer.voice;
      needBy.min = answer.today;
      needBy.max = addDays(answer.today, festivalWindowDays - 1);
    }
    view.show(answer);
    const note = sortNote(answer);
    sortLine.hidden = note === null;
    sortLine.textContent =
      note === null
        ? ""
        : text.t(note, { city: picker.label(answer.city ?? "") });
  },
  onError: (error) => view.problem(text.error(error, "search")),
});

bindSearchField(
  { input: query, clear: find(document, "#search-clear", HTMLButtonElement) },
  () => runs.now(),
);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  runs.now();
});
form.addEventListener("input", (event) => {
  if (event.target === query) runs.soon();
});
form.addEventListener("change", (event) => {
  if (event.target === query) return;
  showFilterCount();
  runs.now();
});
el("#search-retry").addEventListener("click", () => runs.now());

const locationWait = createWait({
  control: locationButton,
  line: el("#location-wait"),
});
locationButton.addEventListener("click", () => void useLocation());

async function useLocation(): Promise<void> {
  const status = el("#location-status");
  status.textContent = "";
  try {
    const place = await locationWait.run(
      (signal) =>
        locate(navigator.geolocation, {
          signal: AbortSignal.any([signal, leaving.signal]),
        }),
      text.t("search.location.wait"),
    );
    located = { place, city: picker.chooseNearest(place) };
    nearest.checked = true;
    cityChanged();
  } catch (error) {
    if (!isLocateError(error)) return;
    status.textContent = text.t(
      error.code === "denied"
        ? "search.location.denied"
        : "search.location.failed",
    );
  }
}

// A new city: the search runs again, and the panel in view loads the stores
// of the city. Her location counts only in the city that it found.
function cityChanged(): void {
  if (located !== null) {
    el("#location-status").textContent =
      located.city === picker.current() ? text.t("search.location.on") : "";
  }
  mountPanel(tabFromHash(location.hash));
  runs.now();
}

let micPhase: RecorderPhase = "idle";
const meter = { level: el("#voice-level"), timer: el("#voice-timer") };
const voice = createVoiceFlow<SearchSpeechAnswer, "reading">({
  recorder: createRecorder((recording) => {
    showVoiceMeter(meter, recording);
    const { phase } = recording;
    if (phase === micPhase) return;
    micPhase = phase;
    sounds.microphone(phase);
    mic.dataset.phase = phase;
    mic.setAttribute(
      "aria-label",
      text.t(phase === "recording" ? "search.voice.stop" : "search.voice.say"),
    );
    el("#listening").hidden = phase !== "recording";
  }),
  prepare: prepareVoice,
  read: async (parts, { signal, onStep }) => {
    const [part] = parts;
    if (part === undefined) throw new Error("A voice search has one part.");
    onStep("reading");
    return api.send(
      "POST",
      "/api/search/speech",
      part,
      searchSpeechAnswerSchema,
      {
        signal,
        timeoutMs: speechTimeoutMs,
      },
    );
  },
  wait: createWait({ control: mic, line: el("#voice-wait") }),
  sounds,
  words: {
    opening: text.t("search.voice.wait_open"),
    step: () => text.t("search.voice.wait_read"),
  },
  onStart() {
    el("#heard").hidden = true;
    el("#voice-error").hidden = true;
  },
  onAtLimit: () => {},
  onAnswer(answer) {
    const words = answer.transcript.trim();
    if (words === "") {
      sounds.fallback();
      voiceProblem(text.t("search.voice.nothing"));
      return;
    }
    sounds.cascade(1);
    query.value = words;
    el("#heard-words").textContent = text.t("search.voice.heard", { words });
    el("#heard-recorded").hidden = !answer.recorded;
    el("#heard").hidden = false;
    runs.now();
  },
  onError: (error) => voiceProblem(text.error(error, "search")),
});
mic.addEventListener("click", () => voice.toggle());

function voiceProblem(words: string): void {
  el("#voice-error").textContent = words;
  el("#voice-error").hidden = words === "";
}

runs.now();
