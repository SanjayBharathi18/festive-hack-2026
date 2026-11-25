import { normaliseSlug } from "../../shared/setup.ts";
import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import { createWait } from "../wait/wait.ts";
import type { Draft } from "./draft.ts";
import type { LinkCheck, LinkState } from "./link-check.ts";
import { readDataUrl, shrinkPhoto } from "./photo.ts";
import type { SlugSuggest } from "./slug-suggest.ts";

export type StoreView = {
  show(draft: Draft): void;
  suggested(slug: string): void;
  showLink(state: LinkState): void;
};

// Her store name, the link that follows it until she types her own, and an
// optional cover photo that the browser shrinks before it is kept.
export function createStoreView({
  form,
  text,
  origin,
  linkCheck,
  slugSuggest,
  draft,
  onChange,
  onNext,
}: {
  form: HTMLFormElement;
  text: Text;
  origin: string;
  linkCheck: Pick<LinkCheck, "check">;
  slugSuggest: Pick<SlugSuggest, "suggest" | "stop">;
  draft: () => Draft;
  onChange: (patch: Partial<Draft>) => void;
  onNext: () => void;
}): StoreView {
  const name = find(form, "#store-name", HTMLInputElement);
  const slug = find(form, "#slug", HTMLInputElement);
  const status = find(form, "#slug-status", HTMLElement);
  const words = find(form, "#slug-words", HTMLElement);
  const freeIcon = find(status, "svg", SVGElement);
  const use = find(form, "#slug-use", HTMLButtonElement);
  const image = find(form, "#cover-img", HTMLImageElement);
  const tile = find(form, "#cover-tile", HTMLElement);
  const file = find(form, "#cover-file", HTMLInputElement);
  const pick = find(form, "#cover-pick-label span", HTMLElement);
  const remove = find(form, "#cover-remove", HTMLButtonElement);
  const coverError = find(form, "#cover-error", HTMLElement);
  const wait = createWait({
    control: find(form, "#cover-pick-label", HTMLElement),
    line: form.querySelector("#cover-wait"),
  });
  find(form, "#link-origin", HTMLElement).textContent =
    `${origin.replace(/^https?:\/\//, "")}/s/`;

  const setSlug = (value: string, edited: boolean) => {
    slug.value = value;
    onChange({ slug: value, slug_edited: edited });
    linkCheck.check(value);
  };
  const showPhoto = (current: Draft) => {
    image.hidden = current.photo === null;
    if (current.photo !== null) image.src = current.photo;
    else image.removeAttribute("src");
    tile.hidden = current.photo !== null;
    tile.textContent = current.name.trim();
    remove.hidden = current.photo === null;
    pick.textContent = text.t(
      current.photo === null
        ? "sell.store.cover_choose"
        : "sell.store.cover_change",
    );
  };

  name.addEventListener("input", () => {
    onChange({ name: name.value });
    tile.textContent = name.value.trim();
    if (!draft().slug_edited) slugSuggest.suggest(name.value);
  });
  slug.addEventListener("input", () => {
    slugSuggest.stop();
    setSlug(slug.value, true);
  });
  slug.addEventListener("change", () => {
    const clean = normaliseSlug(slug.value);
    if (clean !== slug.value) setSlug(clean, true);
  });
  use.addEventListener("click", () => {
    slugSuggest.stop();
    setSlug(use.dataset.slug ?? "", true);
    slug.focus();
  });
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (chosen === undefined) return;
    coverError.hidden = true;
    wait
      .run(
        async (signal) => readDataUrl(await shrinkPhoto(chosen, signal)),
        text.t("sell.store.cover_shrinking"),
      )
      .then((photo) => {
        onChange({ photo });
        showPhoto(draft());
      })
      .catch((error: unknown) => {
        coverError.textContent = text.error(error, "sell");
        coverError.hidden = coverError.textContent === "";
      });
  });
  remove.addEventListener("click", () => {
    onChange({ photo: null });
    showPhoto(draft());
    file.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onNext();
  });

  return {
    show(current) {
      name.value = current.name;
      slug.value = current.slug;
      linkCheck.check(current.slug, true);
      if (current.slug === "" && !current.slug_edited) {
        slugSuggest.suggest(current.name);
      }
      showPhoto(current);
    },
    // A suggested link, unless she typed her own meanwhile.
    suggested(value: string) {
      if (!draft().slug_edited) setSlug(value, false);
    },
    showLink(state) {
      status.dataset.state = state.kind;
      freeIcon.toggleAttribute("hidden", state.kind !== "free");
      words.textContent = linkWords(state, text);
      const suggestion = state.kind === "taken" ? state.suggestion : null;
      use.hidden = suggestion === null;
      use.dataset.slug = suggestion ?? "";
      use.textContent =
        suggestion === null
          ? ""
          : text.t("sell.store.link_use", { slug: suggestion });
      slug.setCustomValidity(
        state.kind === "taken" ? text.t("sell.store.link_taken") : "",
      );
    },
  };
}

function linkWords(state: LinkState, text: Text): string {
  switch (state.kind) {
    case "empty":
      return text.t("sell.store.link_type");
    case "invalid":
      return text.t("sell.store.link_invalid");
    case "checking":
      return text.t("sell.store.link_checking");
    case "free":
      return text.t("sell.store.link_free");
    case "taken":
      return text.t("sell.store.link_taken");
    case "unknown":
      return text.t("sell.store.link_unknown");
  }
}
