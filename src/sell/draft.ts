import { z } from "zod";
import { appLanguageSchema } from "../../shared/languages.ts";
import {
  locationSchema,
  setupItemSchema,
  setupLimits,
  slugSchema,
  type SetupItem,
  type SetupStoreBody,
} from "../../shared/setup.ts";

export const steps = [
  "language",
  "items",
  "store",
  "ways",
  "preview",
  "publish",
  "share",
] as const;
export type Step = (typeof steps)[number];
export type StepState = "done" | "current" | "open" | "locked";

const stepSchema = z.enum(steps);
const text = (max: number) => z.string().max(max);

// Her store before she publishes it. The page keeps it in this browser, so
// she needs no account until the last step.
export const draftSchema = z.object({
  version: z.literal(1),
  store_id: z.uuid(),
  step: stepSchema,
  furthest: stepSchema,
  language: appLanguageSchema.nullable(),
  items: z.array(setupItemSchema).max(setupLimits.items),
  name: text(200),
  slug: text(200),
  slug_edited: z.boolean(),
  photo: z.string().startsWith("data:image/").nullable(),
  offers_pickup: z.boolean(),
  offers_delivery: z.boolean(),
  area: text(200),
  city: text(200),
  address: text(1000),
  location: locationSchema.nullable(),
  phone: text(40),
  published: z
    .object({ slug: slugSchema, name: z.string(), url: z.url() })
    .nullable(),
});
export type Draft = z.infer<typeof draftSchema>;
export type Published = NonNullable<Draft["published"]>;

export function newDraft(storeId: string): Draft {
  return {
    version: 1,
    store_id: storeId,
    step: "language",
    furthest: "language",
    language: null,
    items: [],
    name: "",
    slug: "",
    slug_edited: false,
    photo: null,
    offers_pickup: false,
    offers_delivery: false,
    area: "",
    city: "",
    address: "",
    location: null,
    phone: "",
    published: null,
  };
}

export function isDone(draft: Draft, step: Step): boolean {
  switch (step) {
    case "language":
      return draft.language !== null;
    case "items":
      return draft.items.length > 0;
    case "store":
      return (
        draft.name.trim() !== "" && slugSchema.safeParse(draft.slug).success
      );
    case "ways":
      return (
        (draft.offers_pickup || draft.offers_delivery) &&
        draft.area.trim() !== "" &&
        draft.city.trim() !== ""
      );
    case "preview":
      return stepIndex(draft.furthest) >= stepIndex("preview");
    case "publish":
    case "share":
      return draft.published !== null;
  }
}

// A step opens when each step before it is done. Once she publishes, the
// setup is over: only the share step opens, and the desk changes the store.
export function canOpen(draft: Draft, step: Step): boolean {
  if (draft.published !== null) return step === "share";
  if (step === "share") return false;
  return steps
    .slice(0, stepIndex(step))
    .every((before) => isDone(draft, before));
}

export function stepStates(draft: Draft): { step: Step; state: StepState }[] {
  return steps.map((step) => ({
    step,
    state:
      step === draft.step
        ? "current"
        : isDone(draft, step)
          ? "done"
          : canOpen(draft, step)
            ? "open"
            : "locked",
  }));
}

// The step to show: the one she was on, or the first she can still open.
export function openStep(draft: Draft): Step {
  if (draft.published !== null) return "share";
  if (canOpen(draft, draft.step)) return draft.step;
  return (
    [...steps].reverse().find((step) => canOpen(draft, step)) ?? "language"
  );
}

export function goTo(draft: Draft, step: Step): Draft {
  if (!canOpen(draft, step)) return draft;
  return {
    ...draft,
    step,
    furthest:
      stepIndex(step) > stepIndex(draft.furthest) ? step : draft.furthest,
  };
}

export function nextStep(step: Step): Step {
  return steps[Math.min(stepIndex(step) + 1, steps.length - 1)] ?? step;
}

export function previousStep(step: Step): Step {
  return steps[Math.max(stepIndex(step) - 1, 0)] ?? step;
}

export function withItem(draft: Draft, item: SetupItem): Draft {
  const at = draft.items.findIndex((other) => other.id === item.id);
  const items =
    at === -1
      ? [...draft.items, item]
      : draft.items.map((other, index) => (index === at ? item : other));
  return { ...draft, items };
}

export function withoutItem(draft: Draft, itemId: string): Draft {
  return {
    ...draft,
    items: draft.items.filter((item) => item.id !== itemId),
  };
}

// Puts an item back where it was, for Undo.
export function restoreItem(
  draft: Draft,
  item: SetupItem,
  index: number,
): Draft {
  if (draft.items.some((other) => other.id === item.id)) return draft;
  const items = [...draft.items];
  items.splice(Math.min(index, items.length), 0, item);
  return { ...draft, items };
}

export function storeBody(draft: Draft): SetupStoreBody {
  const address = draft.address.trim();
  return {
    language: draft.language ?? "en",
    name: draft.name.trim(),
    slug: draft.slug,
    offers_pickup: draft.offers_pickup,
    offers_delivery: draft.offers_delivery,
    area: draft.area.trim(),
    city: draft.city.trim(),
    address: draft.offers_pickup && address !== "" ? address : null,
    location: draft.location,
  };
}

export function stepIndex(step: Step): number {
  return steps.indexOf(step);
}
