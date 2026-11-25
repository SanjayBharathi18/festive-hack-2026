import { z } from "zod";
import { planDishSchema, type PlanDish } from "../../shared/catering.ts";
import type { KeyValueStore } from "../cart/cart-storage.ts";

// sent: the request that went to the caterer, with its WhatsApp link, so
// that the page still says so after a reload.
export type KeptPlan = {
  package_id: string;
  picks: readonly PlanDish[];
  guests: string;
  date: string;
  place: string;
  style: string;
  sent: { store: string; whatsapp: string } | null;
};

export type PlanStorage = {
  load(slug: string): KeptPlan | undefined;
  save(slug: string, plan: KeptPlan): void;
};

const keptPlanSchema = z.object({
  v: z.literal(1),
  package_id: z.uuid(),
  picks: z.array(planDishSchema).max(160),
  guests: z.string().max(7),
  date: z.string().max(10),
  place: z.string().max(120),
  style: z.string().max(20),
  sent: z
    .object({
      store: z.string().min(1).max(80),
      whatsapp: z.string().startsWith("https://wa.me/").max(4000),
    })
    .nullable(),
});

// The plan of each caterer stays in this browser, as the food cart does, so
// a reload or a later visit finds the dishes and the event again.
export function createPlanStorage(
  store: KeyValueStore | undefined,
  report: (message: string, error: unknown) => void = console.error,
): PlanStorage {
  const key = (slug: string) => `plan:${slug}`;
  return {
    load(slug) {
      try {
        const text = store?.getItem(key(slug)) ?? null;
        if (text === null) return undefined;
        const parsed = keptPlanSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return undefined;
        const { v: _, ...plan } = parsed.data;
        return plan;
      } catch (error) {
        report("The kept plan could not be read.", error);
        return undefined;
      }
    },
    save(slug, plan) {
      try {
        store?.setItem(key(slug), JSON.stringify({ v: 1, ...plan }));
      } catch (error) {
        report("The plan could not be kept.", error);
      }
    },
  };
}
