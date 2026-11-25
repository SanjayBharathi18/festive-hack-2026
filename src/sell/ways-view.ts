import { find } from "../dom/dom.ts";
import type { Text } from "../text/text.ts";
import type { Draft } from "./draft.ts";

export type WaysView = { show(draft: Draft): void };

type Geolocation = Pick<globalThis.Geolocation, "getCurrentPosition">;

// Pickup, delivery or both, and where she cooks. Her pin is asked for only
// after she presses Use my location, and it stays on the server.
export function createWaysView({
  form,
  text,
  geolocation,
  onChange,
  onNext,
}: {
  form: HTMLFormElement;
  text: Text;
  geolocation: Geolocation | undefined;
  onChange: (patch: Partial<Draft>) => void;
  onNext: () => void;
}): WaysView {
  const pickup = find(form, "#offers-pickup", HTMLInputElement);
  const delivery = find(form, "#offers-delivery", HTMLInputElement);
  const area = find(form, "#area", HTMLInputElement);
  const city = find(form, "#city", HTMLInputElement);
  const address = find(form, "#address", HTMLTextAreaElement);
  const addressField = find(form, "#address-field", HTMLElement);
  const use = find(form, "#use-location", HTMLButtonElement);
  const status = find(form, "#location-status", HTMLElement);
  const clear = find(form, "#location-clear", HTMLButtonElement);

  const showWays = () => {
    pickup.setCustomValidity(
      !pickup.checked && !delivery.checked ? text.t("sell.ways.need_one") : "",
    );
    addressField.hidden = !pickup.checked;
  };
  const showLocation = (saved: boolean, words?: string) => {
    status.textContent =
      words ??
      text.t(saved ? "sell.ways.location_saved" : "sell.ways.location_hint");
    status.dataset.saved = String(saved);
    clear.hidden = !saved;
    use.hidden = saved;
  };

  for (const box of [pickup, delivery]) {
    box.addEventListener("change", () => {
      showWays();
      onChange({
        offers_pickup: pickup.checked,
        offers_delivery: delivery.checked,
      });
    });
  }
  area.addEventListener("input", () => onChange({ area: area.value }));
  city.addEventListener("input", () => onChange({ city: city.value }));
  address.addEventListener("input", () => onChange({ address: address.value }));
  use.addEventListener("click", () => {
    if (geolocation === undefined) {
      showLocation(false, text.t("sell.ways.location_failed"));
      return;
    }
    use.setAttribute("aria-busy", "true");
    status.textContent = text.t("sell.ways.location_finding");
    geolocation.getCurrentPosition(
      ({ coords }) => {
        use.removeAttribute("aria-busy");
        onChange({ location: { lat: coords.latitude, lng: coords.longitude } });
        showLocation(true);
        clear.focus();
      },
      (error) => {
        use.removeAttribute("aria-busy");
        showLocation(
          false,
          text.t(
            error.code === error.PERMISSION_DENIED
              ? "sell.ways.location_denied"
              : "sell.ways.location_failed",
          ),
        );
      },
      { timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  });
  clear.addEventListener("click", () => {
    onChange({ location: null });
    showLocation(false);
    use.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onNext();
  });

  return {
    show(draft) {
      pickup.checked = draft.offers_pickup;
      delivery.checked = draft.offers_delivery;
      area.value = draft.area;
      city.value = draft.city;
      address.value = draft.address;
      showWays();
      showLocation(draft.location !== null);
    },
  };
}
