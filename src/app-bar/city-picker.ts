import {
  citiesAnswerSchema,
  cityChoices,
  type CityChoice,
} from "../../shared/cities.ts";
import type { Point } from "../../shared/geo.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { Api } from "../api/api.ts";
import type { KeyValueStore } from "../cart/cart-storage.ts";
import {
  addressWithCity,
  availableCity,
  chosenCity,
  cityLabel,
  nearestCity,
  readCity,
  saveCity,
} from "./city-choice.ts";

export type CityPicker = {
  current(): string;
  label(city: string): string;
  // Sets the city with stores that is nearest to the buyer's place, and
  // gives the city. It does not call onChange: the page searches itself.
  chooseNearest(place: Point): string;
};

// The city picker of the buyer pages, a native select in the app bar. The
// city shows at once; the list of the cities with stores comes from the
// server, in the order of the buyer's language, each city named by the
// names rule (cityLabel). Each choice of the buyer (or of her location) goes
// in the address (?city=) and in localStorage; a page that she opens with no
// choice keeps its address. onChange hears a choice of the buyer, and a city
// with no store that gives way to another. A page whose content has no city
// needs no onChange: the choice waits for the next list.
export function createCityPicker({
  select,
  api,
  language,
  storage,
  onChange,
  signal,
}: {
  select: HTMLSelectElement;
  api: Pick<Api, "get">;
  language: AppLanguage;
  storage: KeyValueStore | undefined;
  onChange?: (city: string) => void;
  signal?: AbortSignal;
}): CityPicker {
  const collator = new Intl.Collator(`${language}-IN`);
  let choices: CityChoice[] = [];
  let city = chosenCity(
    new URLSearchParams(location.search).get("city"),
    readCity(storage),
  );

  const choiceOf = (key: string) =>
    choices.find((choice) => choice.key === key) ?? cityChoices([key])[0];

  const show = () => {
    const known = choices.some(({ key }) => key === city);
    const list = known ? choices : [...cityChoices([city]), ...choices];
    select.replaceChildren(
      ...list.map(
        ({ key, labels }) => new Option(cityLabel(labels, language), key),
      ),
    );
    select.value = city;
  };

  const keep = (next: string) => {
    city = next;
    select.value = city;
    saveCity(storage, city);
    history.replaceState(history.state, "", addressWithCity(location, city));
  };

  select.addEventListener(
    "change",
    () => {
      keep(select.value);
      onChange?.(city);
    },
    { signal },
  );
  show();
  api.get("/api/cities", citiesAnswerSchema, { signal }).then(
    (answer) => {
      choices = answer.cities.toSorted((a, b) =>
        collator.compare(a.labels[language], b.labels[language]),
      );
      const next = availableCity(city, choices);
      const changed = next !== city;
      city = next;
      show();
      if (changed) onChange?.(city);
    },
    (error: unknown) => {
      if (!signal?.aborted) console.error("The city list did not load.", error);
    },
  );

  return {
    current: () => city,
    label: (key) => choiceOf(key)?.labels[language] ?? key,
    chooseNearest(place) {
      const next = nearestCity(place, choices);
      if (next !== undefined && next !== city) keep(next);
      return city;
    },
  };
}
