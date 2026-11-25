import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import { isAbortError } from "../api/api.ts";
import en from "./en.json" with { type: "json" };

export type Table = { readonly [key: string]: string | Table };
export type TextKey = Leaves<typeof en>;
export type Params = Readonly<Record<string, string | number>>;
export type DayStyle = "weekday" | "short" | "long";

export type TextElement = {
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
};
export type TextRoot = {
  querySelectorAll(selectors: string): Iterable<TextElement>;
};

export type Text = {
  readonly language: AppLanguage;
  t(key: TextKey, params?: Params): string;
  apply(root: TextRoot): void;
  error(error: unknown, namespace?: string): string;
  pieces(count: number): string;
  day(day: Day, style?: DayStyle): string;
};

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

const attributes = [
  ["data-text-label", "aria-label"],
  ["data-text-placeholder", "placeholder"],
] as const;
const textSelector = ["data-text", ...attributes.map(([data]) => data)]
  .map((name) => `[${name}]`)
  .join(", ");

const dayOptions: Record<DayStyle, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "long" },
  short: { weekday: "short", day: "numeric", month: "short" },
  long: { weekday: "long", day: "numeric", month: "long" },
};

const counts = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function createText(language: AppLanguage, table: Table = en): Text {
  const locale = `${language}-IN`;
  const plural = new Intl.PluralRules(locale);
  const dayFormats = new Map<DayStyle, Intl.DateTimeFormat>();
  const find = (key: string) => lookup(table, key) ?? lookup(en, key);
  const first = (keys: readonly string[], params?: Params) => {
    for (const key of keys) {
      const template = find(key);
      if (template !== undefined) return fill(template, params);
    }
    return keys.at(-1) ?? "";
  };

  return {
    language,
    t: (key, params) => first([key], params),
    apply(root) {
      for (const element of root.querySelectorAll(textSelector)) {
        const key = element.getAttribute("data-text");
        const words = key === null ? undefined : find(key);
        if (words !== undefined) element.textContent = words;
        for (const [data, attribute] of attributes) {
          const attributeKey = element.getAttribute(data);
          const value = attributeKey === null ? undefined : find(attributeKey);
          if (value !== undefined) element.setAttribute(attribute, value);
        }
      }
    },
    error(error, namespace) {
      if (isAbortError(error)) return "";
      const { code, params } = codeOf(error);
      const keys = [`common.error.${code}`, "common.error.unknown"];
      return first(
        namespace === undefined
          ? keys
          : [`${namespace}.error.${code}`, ...keys],
        params,
      );
    },
    pieces(count) {
      return first(
        [
          `common.unit.piece_${plural.select(count)}`,
          "common.unit.piece_other",
        ],
        { count: counts.format(count) },
      );
    },
    day(day, style = "long") {
      let format = dayFormats.get(style);
      if (format === undefined) {
        format = new Intl.DateTimeFormat(locale, {
          ...dayOptions[style],
          timeZone: "Asia/Kolkata",
          numberingSystem: "latn",
        });
        dayFormats.set(style, format);
      }
      return format.format(new Date(`${day}T12:00:00+05:30`));
    },
  };
}

function lookup(table: Table, key: string): string | undefined {
  let node: string | Table | undefined = table;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function fill(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function codeOf(error: unknown): { code: string; params?: Params } {
  if (typeof error !== "object" || error === null) return { code: "unknown" };
  const code = "code" in error ? error.code : undefined;
  const params = "params" in error ? error.params : undefined;
  return {
    code: typeof code === "string" ? code : "unknown",
    ...(isParams(params) ? { params } : {}),
  };
}

function isParams(value: unknown): value is Params {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (item) => typeof item === "string" || typeof item === "number",
    )
  );
}
