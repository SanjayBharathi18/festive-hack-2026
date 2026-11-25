import {
  sameName,
  type CateringPackage,
  type PackageDish,
  type PackageOffer,
  type PlanDish,
} from "../../shared/catering.ts";
import { shownName } from "../../shared/item-names.ts";
import { cloneTemplate, find } from "../dom/dom.ts";
import { unitPrice } from "../quotes/summary.ts";
import type { Text } from "../text/text.ts";
import { offerLimits, offerPrice } from "./offer-words.ts";
import { overLimits, type PlanState, type Refusal } from "./plan.ts";

export type PlanTemplates = Record<
  "pkg" | "category" | "dish" | "offer",
  HTMLTemplateElement
>;

// The package cards, the dishes of each category, and the refusal with the
// packages that allow the pick. After a change to a smaller package, the
// refusal names each limit that the picks break, with the packages that
// allow them.
export function createPlanView({
  packagesRoot,
  categoriesRoot,
  refused,
  templates,
  text,
  packages,
  onPackage,
  onDish,
  onOffer,
}: {
  packagesRoot: HTMLElement;
  categoriesRoot: HTMLElement;
  refused: HTMLElement;
  templates: PlanTemplates;
  text: Text;
  packages: readonly CateringPackage[];
  onPackage: (id: string) => void;
  onDish: (pick: PlanDish, button: HTMLButtonElement) => void;
  onOffer: (id: string) => void;
}) {
  const radios = new Map<string, HTMLInputElement>();
  for (const pkg of packages) {
    const card = cloneTemplate(templates.pkg);
    const radio = find(card, "input", HTMLInputElement);
    radio.value = pkg.id;
    radio.addEventListener("change", () => onPackage(pkg.id));
    find(card, ".package-name", HTMLElement).textContent = pkg.name;
    const price = find(card, ".package-price", HTMLElement);
    price.textContent = unitPrice(pkg.price, pkg.kind, text);
    price.classList.toggle("num", pkg.price !== null);
    find(card, ".package-limits", HTMLElement).textContent = offerLimits(
      { ...pkg, limits: pkg.categories },
      text,
    );
    find(card, ".package-min", HTMLElement).textContent = text.t(
      pkg.kind === "plate" ? "catering.min.plate" : "catering.min.buffet",
      { count: pkg.min_count },
    );
    radios.set(pkg.id, radio);
    packagesRoot.append(card);
  }
  const offersRoot = find(refused, "#refused-offers", HTMLElement);
  const refusedWords = find(refused, "#refused-words", HTMLElement);
  let shownPackage: string | undefined;
  let buttons = new Map<string, HTMLButtonElement>();

  const showCategories = (pkg: CateringPackage) => {
    buttons = new Map();
    categoriesRoot.replaceChildren(
      ...pkg.categories.map((category) => {
        const section = cloneTemplate(templates.category);
        section.dataset.category = category.name;
        find(section, ".category-name", HTMLElement).textContent =
          category.name;
        const dishes = find(section, ".category-dishes", HTMLElement);
        for (const dish of category.dishes) {
          const button = dishButton(dish);
          const pick = { category: category.name, dish: dish.name };
          button.addEventListener("click", () => onDish(pick, button));
          buttons.set(key(pick), button);
          dishes.append(button);
        }
        return section;
      }),
    );
  };

  const dishButton = (dish: PackageDish): HTMLButtonElement => {
    const button = cloneTemplate(templates.dish);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("The dish template is not a button.");
    }
    const mark = find(button, ".food-mark", HTMLElement);
    if (dish.veg_mark !== "veg") mark.dataset.food = "non-veg";
    mark.setAttribute("aria-label", text.t(`catering.mark.${dish.veg_mark}`));
    const name = shownName(
      { name: dish.name, name_latin: null },
      text.language,
    );
    const shown = find(button, ".dish-name", HTMLElement);
    shown.textContent = name.primary;
    if (name.lang !== text.language) shown.lang = name.lang;
    const tag = find(button, ".dish-tag", HTMLElement);
    const words = [
      ...(dish.veg_mark === "egg" ? [text.t("catering.mark.egg")] : []),
      ...(dish.jain ? [text.t("catering.dish.jain")] : []),
    ];
    tag.textContent = words.join(" · ");
    tag.hidden = words.length === 0;
    return button;
  };

  return {
    render(state: PlanState): void {
      const radio = radios.get(state.pkg.id);
      if (radio !== undefined) radio.checked = true;
      if (shownPackage !== state.pkg.id) {
        shownPackage = state.pkg.id;
        showCategories(state.pkg);
      }
      for (const [name, button] of buttons) {
        const [category = "", dish = ""] = name.split("\u0000");
        button.setAttribute(
          "aria-pressed",
          String(
            state.picks.some((pick) => key(pick) === key({ category, dish })),
          ),
        );
      }
      for (const section of categoriesRoot.querySelectorAll<HTMLElement>(
        ".plan-category",
      )) {
        const category = state.pkg.categories.find(
          ({ name }) => name === section.dataset.category,
        );
        const checked = state.check?.categories.find(
          ({ name }) => name === section.dataset.category,
        );
        if (category === undefined) continue;
        const chosen =
          checked?.chosen ??
          state.picks.filter((pick) => pick.category === category.name).length;
        const max = state.pkg.free_choice ? null : category.max;
        find(section, ".category-count", HTMLElement).textContent =
          max === null ? String(chosen) : `${chosen} / ${max}`;
        const toRemove =
          checked?.over === true && checked.max !== null
            ? checked.chosen - checked.max
            : 0;
        const need = find(section, ".category-need", HTMLElement);
        need.hidden =
          checked === undefined || (checked.missing === 0 && toRemove === 0);
        need.textContent =
          toRemove > 0
            ? text.t("catering.plan.remove", { count: toRemove })
            : text.t("catering.plan.need", { count: checked?.missing ?? 0 });
      }
      const shown =
        state.refused === undefined
          ? { refusals: overLimits(state.check), fitting: state.fitting }
          : {
              refusals: [state.refused.refusal],
              fitting: state.refused.fitting,
            };
      refused.hidden = shown.refusals.length === 0;
      if (shown.refusals.length === 0) return;
      refusedWords.textContent = shown.refusals
        .map((refusal) => refusalWords(refusal, state.pkg, text))
        .join(" ");
      offersRoot.replaceChildren(
        ...shown.fitting.map((offer) => {
          const button = cloneTemplate(templates.offer);
          button.textContent = offerWords(offer, shown.refusals, text);
          button.addEventListener("click", () => onOffer(offer.id));
          return button;
        }),
      );
      find(refused, "#refused-hint", HTMLElement).hidden =
        shown.fitting.length === 0;
    },
    // Focus for the keyboard after a change of package: the dish, or the
    // package when the dish is not in it or there is none.
    focus(pick: PlanDish | undefined): void {
      const dish = pick === undefined ? undefined : buttons.get(key(pick));
      (dish ?? radios.get(shownPackage ?? ""))?.focus();
    },
    setBusy(button: HTMLButtonElement, busy: boolean): void {
      if (busy) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    },
  };
}

export function refusalWords(
  refusal: Refusal,
  pkg: Pick<CateringPackage, "kind">,
  text: Pick<Text, "t">,
): string {
  const kind = text.t(`catering.kind.${pkg.kind}`);
  return refusal.kind === "category"
    ? text.t("catering.plan.refused_category", {
        kind,
        count: refusal.max,
        category: refusal.name.toLocaleLowerCase(),
      })
    : text.t("catering.plan.refused_total", { kind, count: refusal.max });
}

// "Gold plate: 3 sweets, 13 dishes, ₹500 a plate": the limit of each
// category that was refused, the total and the price.
export function offerWords(
  offer: PackageOffer,
  refusals: readonly Refusal[],
  text: Pick<Text, "t">,
): string {
  const parts: string[] = [];
  if (offer.free_choice) {
    parts.push(text.t("catering.free_choice"));
  } else {
    for (const refusal of refusals) {
      if (refusal.kind !== "category") continue;
      const limit = offer.limits.find(
        ({ name }) => sameName(name) === sameName(refusal.name),
      );
      if (limit?.max == null) continue;
      parts.push(
        text.t("catering.plan.offer_category", {
          count: limit.max,
          category: limit.name.toLocaleLowerCase(),
        }),
      );
    }
    if (offer.max_total !== null) {
      parts.push(
        text.t("catering.plan.offer_total", { count: offer.max_total }),
      );
    }
  }
  parts.push(offerPrice(offer, text));
  return `${offer.name}: ${parts.join(", ")}`;
}

function key(pick: PlanDish): string {
  return `${pick.category}\u0000${pick.dish}`;
}
