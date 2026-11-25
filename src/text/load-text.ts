import type { AppLanguage } from "../../shared/languages.ts";
import { storageOf } from "../cart/cart-storage.ts";
import { pageLanguage } from "./language.ts";
import { createText, type Table, type Text } from "./text.ts";

const tables: Record<
  Exclude<AppLanguage, "en">,
  () => Promise<{ default: Table }>
> = {
  hi: () => import("./hi.json"),
  kn: () => import("./kn.json"),
  ta: () => import("./ta.json"),
  te: () => import("./te.json"),
  mr: () => import("./mr.json"),
};

export async function loadText(): Promise<Text> {
  const language = pageLanguage(
    new URLSearchParams(location.search).get("lang"),
    {
      visit: storageOf(() => sessionStorage),
      visits: storageOf(() => localStorage),
    },
  );
  const text = await textFor(language);
  document.documentElement.lang = text.language;
  text.apply(document);
  return text;
}

async function textFor(language: AppLanguage): Promise<Text> {
  if (language === "en") return createText("en");
  try {
    return createText(language, (await tables[language]()).default);
  } catch (error) {
    console.error(`The ${language} app text did not load.`, error);
    return createText("en");
  }
}
