import {
  planCheckAnswerSchema,
  planEstimate,
  serviceStyleSchema,
  styleExtra,
  type CateringPackage,
  type PlanDish,
} from "../../shared/catering.ts";
import { storePageSchema, type StorePage } from "../../shared/store.ts";
import { createApi } from "../api/api.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { showAppBar } from "../buyer/app-bar.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { leaveWithSound } from "../sound/leave.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { createContactDialog } from "../quotes/contact-dialog.ts";
import { serviceWords } from "../quotes/summary.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { formatMoney } from "../text/format.ts";
import { loadText } from "../text/load-text.ts";
import { createWait } from "../wait/wait.ts";
import {
  createPlan,
  eventProblem,
  missingDishes,
  overLimits,
  type PlanState,
} from "./plan.ts";
import { createPlanStorage } from "./plan-storage.ts";
import { createPlanView } from "./plan-view.ts";

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
const kept = createPlanStorage(storageOf(() => localStorage));
const [, , slug = "", packageId = ""] = location.pathname
  .split("/")
  .map((part) => decodeURIComponent(part));
const template = (id: string) => find(document, id, HTMLTemplateElement);
const el = <T extends Element>(id: string, type: abstract new () => T) =>
  find(document, id, type);
const loadWait = createWait({
  control: el("#page", HTMLElement),
  line: el("#load-wait", HTMLElement),
});
const stop = new AbortController();
addEventListener("pagehide", () => stop.abort());

void load();

async function load(): Promise<void> {
  try {
    const page = await loadWait.run(
      (signal) =>
        api.get(`/api/stores/${encodeURIComponent(slug)}`, storePageSchema, {
          signal,
        }),
      text.t("catering.plan.loading"),
    );
    showAppBar(document, page.store, location.search, text);
    const packages = page.catering?.packages ?? [];
    if (!packages.some(({ id }) => id === packageId)) {
      throw Object.assign(new Error("No package"), { code: "not_found" });
    }
    start(page, packages);
  } catch (error) {
    el("#load-error", HTMLElement).textContent = text.error(error, "catering");
    el("#back-link", HTMLAnchorElement).href = `/s/${encodeURIComponent(slug)}`;
    el("#load-problem", HTMLElement).hidden = false;
  }
}

function start(page: StorePage, packages: readonly CateringPackage[]): void {
  el("#plan", HTMLElement).hidden = false;
  const today = page.days.today;
  const booked = new Set(page.catering?.booked ?? []);
  const guests = el("#guests", HTMLInputElement);
  const date = el("#event-date", HTMLInputElement);
  const place = el("#event-place", HTMLInputElement);
  const estimate = el("#estimate", HTMLElement);
  const status = el("#plan-status", HTMLElement);
  const contact = el("#contact", HTMLButtonElement);
  const styles = el("#styles", HTMLElement);
  const sent = el("#plan-sent", HTMLElement);
  const whatsapp = el("#plan-whatsapp", HTMLAnchorElement);
  const dialog = createContactDialog({ api, text, sounds });
  const saved = kept.load(slug);
  let sentTo = saved?.sent ?? null;
  let focusAfter: { packageId: string; pick: PlanDish | undefined } | undefined;
  date.min = today;

  const choices = <V extends string>(
    root: HTMLElement,
    name: string,
    values: readonly V[],
    words: (value: V) => string,
    chosen: string | undefined,
  ) => {
    const first = values.includes(chosen as V) ? chosen : values[0];
    root.replaceChildren(
      ...values.map((value) => {
        const chip = cloneTemplate(template("#choice-template"));
        const input = find(chip, "input", HTMLInputElement);
        input.name = name;
        input.value = value;
        input.checked = value === first;
        input.addEventListener("change", render);
        find(chip, ".choice-word", HTMLElement).textContent = words(value);
        return chip;
      }),
    );
  };
  const picked = (root: HTMLElement) =>
    root.querySelector<HTMLInputElement>("input:checked")?.value ?? "";
  const style = () =>
    serviceStyleSchema.safeParse(picked(styles)).data ?? "delivery";
  // A change of package plays settle, or limit when the picks break its
  // limits.
  const switched = () =>
    overLimits(plan.state.check).length > 0 ? sounds.limit() : sounds.settle();

  const plan = createPlan({
    packages,
    packageId,
    picks: saved?.package_id === packageId ? saved.picks : [],
    signal: stop.signal,
    check: (id, dishes, signal) =>
      api.send(
        "POST",
        "/api/catering/check",
        { store_id: page.store.id, package_id: id, dishes },
        planCheckAnswerSchema,
        { signal },
      ),
    onChange: (state) => {
      if (state.pkg.id !== shownStyles) showStyles(state.pkg);
      view.render(state);
      if (focusAfter?.packageId === state.pkg.id) {
        view.focus(focusAfter.pick);
        focusAfter = undefined;
      }
      render();
    },
  });
  let shownStyles = "";
  const showStyles = (pkg: CateringPackage) => {
    const chosen = shownStyles === "" ? saved?.style : picked(styles);
    shownStyles = pkg.id;
    choices(
      styles,
      "style",
      pkg.service_styles,
      (value) => serviceWords(value, styleExtra(pkg, value), pkg.kind, text),
      chosen,
    );
    history.replaceState(
      null,
      "",
      `/c/${encodeURIComponent(slug)}/${pkg.id}${location.search}`,
    );
  };
  const failed = (error: unknown) => {
    status.textContent = text.error(error, "catering");
  };
  const view = createPlanView({
    packagesRoot: el("#packages", HTMLElement),
    categoriesRoot: el("#categories", HTMLElement),
    refused: el("#refused", HTMLElement),
    templates: {
      pkg: template("#package-template"),
      category: template("#category-template"),
      dish: template("#dish-template"),
      offer: template("#offer-template"),
    },
    text,
    packages,
    onPackage: (id) => void plan.switchTo(id, false).then(switched, failed),
    onOffer: (id) => {
      focusAfter = { packageId: id, pick: plan.state.refused?.pick };
      void plan.switchTo(id, true).then(switched, failed);
    },
    onDish: (pick, button) => {
      if (plan.has(pick)) sounds.pick(false);
      const busy = setTimeout(
        () => button.setAttribute("aria-busy", "true"),
        300,
      );
      void plan
        .toggle(pick)
        .then((outcome) => {
          if (outcome === "added") sounds.pick(true);
          if (outcome === "refused") sounds.limit();
        })
        .catch(failed)
        .finally(() => {
          clearTimeout(busy);
          button.removeAttribute("aria-busy");
        });
    },
  });

  function problem(state: PlanState): string | undefined {
    if (state.picks.length === 0) return text.t("catering.plan.status.pick");
    if (state.check === undefined)
      return text.t("catering.plan.status.checking");
    if (overLimits(state.check).length > 0) {
      return text.t("catering.plan.status.over");
    }
    const missing = missingDishes(state.check);
    if (missing.length > 0) {
      return text.t("catering.plan.status.missing", {
        list: missing.map(({ name, count }) => `${name} ${count}`).join(", "),
      });
    }
    const event = eventProblem(
      { date: date.value, guests: guests.valueAsNumber, place: place.value },
      { today, booked, minCount: state.pkg.min_count },
    );
    return event === undefined
      ? undefined
      : text.t(`catering.plan.status.${event}`, {
          name: state.pkg.name,
          count: state.pkg.min_count,
        });
  }

  function render(): void {
    const { state } = plan;
    estimate.textContent = estimateWords(state.pkg, guests.valueAsNumber);
    const reason = problem(state);
    status.textContent = reason ?? text.t("catering.plan.status.ready");
    contact.disabled = reason !== undefined;
    showSent();
    kept.save(slug, {
      package_id: state.pkg.id,
      picks: state.picks,
      guests: guests.value,
      date: date.value,
      place: place.value,
      style: picked(styles),
      sent: sentTo,
    });
  }

  // "120 plates × (₹500 + ₹40) = ₹64,800": the package price, the extra of
  // the service style, and the total.
  function estimateWords(pkg: CateringPackage, count: number): string {
    if (pkg.price === null) return text.t("catering.plan.on_request");
    if (!Number.isInteger(count) || count < 1) return "";
    const chosen = style();
    const extra = styleExtra(pkg, chosen);
    const words = {
      count,
      price: formatMoney(pkg.price),
      extra: formatMoney(extra),
      total: formatMoney(planEstimate(pkg, count, chosen) ?? 0),
    };
    return extra === 0
      ? text.t(`catering.plan.estimate.${pkg.kind}`, words)
      : text.t(`catering.plan.estimate_extra.${pkg.kind}`, words);
  }

  // After a request, the page says so, and Send on WhatsApp leads.
  function showSent(): void {
    sent.hidden = sentTo === null;
    contact.className = sentTo === null ? "btn-primary" : "btn-plain";
    if (sentTo === null) return;
    el("#plan-sent-words", HTMLElement).textContent = text.t(
      "catering.plan.sent",
      { store: sentTo.store },
    );
    whatsapp.href = sentTo.whatsapp;
  }

  contact.addEventListener("click", () => {
    const { state } = plan;
    if (problem(state) !== undefined) return;
    const event = {
      date: date.value,
      guests: guests.valueAsNumber,
      place: place.value.trim(),
      service_style: style(),
    };
    dialog.open(
      {
        store: page.store.name,
        lines: [
          `${state.pkg.name} · ${estimate.textContent ?? ""}`,
          ...state.pkg.categories.flatMap(({ name }) => {
            const dishes = state.picks
              .filter((pick) => pick.category === name)
              .map(({ dish }) => dish);
            return dishes.length === 0 ? [] : [`${name}: ${dishes.join(", ")}`];
          }),
          `${text.day(event.date, "long")} · ${place.value.trim()}`,
          serviceWords(
            event.service_style,
            styleExtra(state.pkg, event.service_style),
            state.pkg.kind,
            text,
          ),
        ],
        request: {
          kind: "catering",
          store_id: page.store.id,
          package_id: state.pkg.id,
          dishes: [...state.picks],
          event,
        },
      },
      (answer, link) => {
        sentTo = { store: answer.store.name, whatsapp: link };
        render();
      },
    );
  });
  whatsapp.addEventListener("click", (event) =>
    leaveWithSound(event, whatsapp, () => sounds.commit()),
  );
  for (const input of [guests, date, place])
    input.addEventListener("input", render);

  guests.value = saved?.guests || String(plan.state.pkg.min_count);
  date.value = saved?.date ?? "";
  place.value = saved?.place ?? "";
  showStyles(plan.state.pkg);
  view.render(plan.state);
  render();
  if (plan.state.picks.length > 0) {
    void plan.switchTo(plan.state.pkg.id, false).catch(failed);
  }
}
