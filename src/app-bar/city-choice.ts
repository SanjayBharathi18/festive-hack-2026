import {
  cityKey,
  defaultCity,
  maxCityLength,
  type CityChoice,
  type CityLabels,
} from "../../shared/cities.ts";
import { distanceKm, type Point } from "../../shared/geo.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { KeyValueStore } from "../cart/cart-storage.ts";

// The last city that the buyer chose, for her next visit.
export const cityStorageKey = "buyer.city";

// The city of a page: the one in its address, so that a link and Back keep
// it; else her last choice; else Bengaluru.
export function chosenCity(
  fromAddress: string | null,
  fromStorage: string | null,
): string {
  for (const value of [fromAddress, fromStorage]) {
    const key = value === null ? "" : cityKey(value);
    if (key !== "" && key.length <= maxCityLength) return key;
  }
  return defaultCity;
}

// A city with no store now gives way to Bengaluru, else to the first city
// of the list. With no list, the city stays.
export function availableCity(
  city: string,
  choices: readonly Pick<CityChoice, "key">[],
): string {
  if (choices.length === 0 || choices.some(({ key }) => key === city)) {
    return city;
  }
  return (
    choices.find(({ key }) => key === defaultCity)?.key ??
    choices[0]?.key ??
    city
  );
}

// The city with stores whose centre is nearest to the buyer's place.
export function nearestCity(
  place: Point,
  choices: readonly Pick<CityChoice, "key" | "centre">[],
): string | undefined {
  let nearest: { key: string; km: number } | undefined;
  for (const { key, centre } of choices) {
    if (centre === null) continue;
    const km = distanceKm(place, centre);
    if (nearest === undefined || km < nearest.km) nearest = { key, km };
  }
  return nearest?.key;
}

export function readCity(storage: KeyValueStore | undefined): string | null {
  try {
    return storage?.getItem(cityStorageKey) ?? null;
  } catch {
    return null;
  }
}

export function saveCity(
  storage: KeyValueStore | undefined,
  city: string,
  report: (message: string, error: unknown) => void = console.error,
): void {
  try {
    storage?.setItem(cityStorageKey, city);
  } catch (error) {
    report("The city choice was not kept.", error);
  }
}

// The address of the page with the city in it, and its other values kept.
export function addressWithCity(
  {
    pathname,
    search,
    hash,
  }: { pathname: string; search: string; hash: string },
  city: string,
): string {
  const query = new URLSearchParams(search);
  query.set("city", city);
  return `${pathname}?${query}${hash}`;
}

// The names rule: a city shows in English; in another language, its name in
// that language comes first, then the English name.
export function cityLabel(labels: CityLabels, language: AppLanguage): string {
  const own = labels[language];
  return language === "en" || own === labels.en
    ? labels.en
    : `${own} · ${labels.en}`;
}
