import type { AppLanguage } from "../../shared/languages.ts";
import { slugSchema } from "../../shared/setup.ts";
import type { Text } from "../text/text.ts";
import { stepIndex, type Draft, type Step } from "./draft.ts";

export const languageNames: Record<AppLanguage, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
  ta: "தமிழ்",
  te: "తెలుగు",
  mr: "मराठी",
};

// What each step holds, under its name in the list of steps, so she sees
// her whole store as she goes.
export function stepValue(
  draft: Draft,
  step: Step,
  text: Pick<Text, "t">,
): string {
  switch (step) {
    case "language":
      return draft.language === null ? "" : languageNames[draft.language];
    case "items": {
      const count = draft.items.length;
      if (count === 0) return "";
      return text.t(
        count === 1 ? "sell.steps.items_one" : "sell.steps.items_other",
        {
          count,
        },
      );
    }
    case "store":
      return slugSchema.safeParse(draft.slug).success ? `/s/${draft.slug}` : "";
    case "ways": {
      if (!draft.offers_pickup && !draft.offers_delivery) return "";
      const ways = text.t(
        draft.offers_pickup && draft.offers_delivery
          ? "sell.steps.ways_both"
          : draft.offers_pickup
            ? "store.fact.pickup_only"
            : "store.fact.delivery_only",
      );
      const area = draft.area.trim();
      return area === "" ? ways : `${ways} · ${area}`;
    }
    case "preview":
      return stepIndex(draft.furthest) > stepIndex("preview")
        ? text.t("sell.steps.checked")
        : "";
    case "publish":
      return draft.published === null ? "" : text.t("sell.steps.published");
    case "share":
      return "";
  }
}

export function shareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
