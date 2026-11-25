import { appLanguageSchema, type AppLanguage } from "../../shared/languages.ts";

export type LanguageStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

// The language that the person picked, under the same key in the store of
// the visit (sessionStorage) and in the store of her next visits
// (localStorage).
export const languageKey = "text.lang";

// Each page is in English, unless the person asked for another language. A
// ?lang= link sets it for the visit, so the pages that follow it (checkout,
// the order page) keep it. The language select of the app bar also keeps it
// for her next visits.
export function pageLanguage(
  query: string | null | undefined,
  stores: { visit?: LanguageStore; visits?: LanguageStore },
): AppLanguage {
  const asked = appLanguageOf(query);
  if (asked !== undefined) keep(stores.visit, asked);
  return (
    asked ??
    appLanguageOf(read(stores.visit)) ??
    appLanguageOf(read(stores.visits)) ??
    "en"
  );
}

export function keepLanguage(
  language: AppLanguage,
  stores: readonly (LanguageStore | undefined)[],
): void {
  for (const store of stores) keep(store, language);
}

// The address of the page in another language, with its other values kept.
export function addressWithLanguage(
  {
    pathname,
    search,
    hash,
  }: { pathname: string; search: string; hash: string },
  language: AppLanguage,
): string {
  const query = new URLSearchParams(search);
  query.set("lang", language);
  return `${pathname}?${query}${hash}`;
}

export function appLanguageOf(
  tag: string | null | undefined,
): AppLanguage | undefined {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  const result = appLanguageSchema.safeParse(primary);
  return result.success ? result.data : undefined;
}

function read(store: LanguageStore | undefined): string | null {
  try {
    return store?.getItem(languageKey) ?? null;
  } catch {
    return null;
  }
}

function keep(store: LanguageStore | undefined, language: AppLanguage): void {
  try {
    store?.setItem(languageKey, language);
  } catch (error) {
    console.error("The language choice was not kept.", error);
  }
}
