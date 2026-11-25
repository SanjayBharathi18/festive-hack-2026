import type { AppLanguage } from "../../shared/languages.ts";
import { storageOf } from "../cart/cart-storage.ts";
import {
  addressWithLanguage,
  appLanguageOf,
  keepLanguage,
} from "../text/language.ts";

// The language select of the app bar, on every page: the six languages, each
// in its own script. A choice goes in the address (?lang=) and in the stores
// of the visit and of the next visits; then the page loads again in that
// language, and the browser puts back what she typed in its fields.
export function bindLanguagePicker(
  select: HTMLSelectElement,
  language: AppLanguage,
  signal?: AbortSignal,
): void {
  select.value = language;
  select.addEventListener(
    "change",
    () => {
      const chosen = appLanguageOf(select.value);
      if (chosen === undefined || chosen === language) return;
      keepLanguage(chosen, [
        storageOf(() => sessionStorage),
        storageOf(() => localStorage),
      ]);
      history.replaceState(
        history.state,
        "",
        addressWithLanguage(location, chosen),
      );
      location.reload();
    },
    { signal },
  );
}
