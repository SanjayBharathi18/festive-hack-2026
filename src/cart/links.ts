import { appLanguageSchema, type AppLanguage } from "../../shared/languages.ts";

export type Via = "market";

// A buyer who came from the marketplace, or who chose a language with ?lang=,
// keeps both on each page of the order.
export function buyerHref(
  path: string,
  search: string,
  {
    extra = {},
    hash = "",
  }: { extra?: Readonly<Record<string, string>>; hash?: string } = {},
): string {
  const from = new URLSearchParams(search);
  const query = new URLSearchParams();
  if (viaOf(search) !== undefined) query.set("via", "market");
  const lang = appLanguageSchema.safeParse(from.get("lang"));
  if (lang.success) query.set("lang", lang.data);
  for (const [name, value] of Object.entries(extra)) query.set(name, value);
  const text = query.toString();
  return `${path}${text === "" ? "" : `?${text}`}${hash}`;
}

export function viaOf(search: string): Via | undefined {
  return new URLSearchParams(search).get("via") === "market"
    ? "market"
    : undefined;
}

// An API path for a reader of another script asks for the item names in it.
export function withLanguage(path: string, language: AppLanguage): string {
  return language === "en" ? path : `${path}?lang=${language}`;
}

// The wordmark leads a buyer from the marketplace back to it. The seller's
// own link shows only her store, so from there it leads to her store.
export function brandHref(slug: string, search: string): string {
  if (viaOf(search) === undefined) return buyerHref(`/s/${slug}`, search);
  const home = new URLSearchParams(search);
  home.delete("via");
  return buyerHref("/", `?${home.toString()}`);
}
