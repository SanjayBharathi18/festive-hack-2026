import { privacyAnswerSchema } from "../../shared/privacy.ts";
import { createApi } from "../api/api.ts";
import { createCityPicker } from "../app-bar/city-picker.ts";
import { bindLanguagePicker } from "../app-bar/language-picker.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { find } from "../dom/dom.ts";
import { createSounds } from "../sound/engine.ts";
import { bindSoundToggle } from "../sound/toggle.ts";
import { loadText } from "../text/load-text.ts";

const text = await loadText();
const sounds = createSounds({ store: storageOf(() => localStorage) });
bindSoundToggle(find(document, "#sound-toggle", HTMLButtonElement), sounds, {
  on: text.t("sound.on"),
  off: text.t("sound.off"),
});
bindLanguagePicker(
  find(document, "#language-picker", HTMLSelectElement),
  text.language,
);
createCityPicker({
  select: find(document, "#city-picker", HTMLSelectElement),
  api: createApi(),
  language: text.language,
  storage: storageOf(() => localStorage),
});
find(document, "#privacy-lead", HTMLElement).textContent = text.t(
  "privacy.lead",
  { product: text.t("common.product") },
);

// With no contact set, or no answer, the page says to write to the store.
try {
  const { contact } = await createApi().get(
    "/api/privacy",
    privacyAnswerSchema,
  );
  if (contact !== null) {
    find(document, "#privacy-complain", HTMLElement).textContent = text.t(
      "privacy.complain_to",
      { contact },
    );
  }
} catch (error) {
  console.error("The privacy contact did not load.", error);
}
