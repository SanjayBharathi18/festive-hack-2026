import { z } from "zod";
import { fulfilmentSchema } from "../../shared/model.ts";
import { verifyStartAnswerSchema } from "../../shared/verify.ts";
import type { KeyValueStore } from "../cart/cart-storage.ts";

export type Buyer = { name: string; phone: string };
export type Draft = z.infer<typeof draftSchema>;
export type KeptCheck = z.infer<typeof keptCheckSchema>;

const buyerSchema = z.object({
  name: z.string().max(80),
  phone: z.string().max(32),
});

const draftSchema = z.object({
  fulfilment: fulfilmentSchema.nullable(),
  address: z.string().max(300),
  gift: z.boolean(),
  gift_name: z.string().max(80),
  gift_phone: z.string().max(32),
  gift_message: z.string().max(300),
  note: z.string().max(500),
  buyer_name: z.string().max(80).default(""),
  phone: z.string().max(32).default(""),
  payment: z.enum(["now", "later"]).nullable().default(null),
});

// The last step as the tab keeps it: the code that was sent, or the proof of
// a checked code, each for one number and until it expires.
const keptCheckSchema = z.object({
  sent: z
    .object({ phone: z.string().max(32), answer: verifyStartAnswerSchema })
    .optional(),
  proof: z
    .object({
      token: z.string().min(32).max(512),
      expiresAt: z.int(),
      phone: z.string().max(32),
    })
    .optional(),
});

export const emptyDraft: Draft = {
  fulfilment: null,
  address: "",
  gift: false,
  gift_name: "",
  gift_phone: "",
  gift_message: "",
  note: "",
  buyer_name: "",
  phone: "",
  payment: null,
};

// The phone remembers the buyer's name and number for the next order. What
// she types, and her checked code, live only in this tab, so a trip back to
// change the day or to read the privacy page keeps them.
export function createCheckoutStorage({
  phone,
  tab,
  report = console.error,
}: {
  phone: KeyValueStore | undefined;
  tab: KeyValueStore | undefined;
  report?: (message: string, error: unknown) => void;
}) {
  const draftKey = (slug: string) => `checkout:${slug}`;
  const checkKey = (slug: string) => `checkout-code:${slug}`;
  const read = <T>(
    store: KeyValueStore | undefined,
    key: string,
    schema: z.ZodType<T>,
  ) => {
    try {
      const text = store?.getItem(key) ?? null;
      if (text === null) return undefined;
      const parsed = schema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : undefined;
    } catch (error) {
      if (!(error instanceof SyntaxError))
        report(`${key} could not be read.`, error);
      return undefined;
    }
  };
  const write = (
    store: KeyValueStore | undefined,
    key: string,
    value: unknown,
  ) => {
    try {
      if (value === undefined) store?.removeItem(key);
      else store?.setItem(key, JSON.stringify(value));
    } catch (error) {
      report(`${key} could not be saved on this phone.`, error);
    }
  };
  return {
    buyer: (): Buyer | undefined => read(phone, "buyer", buyerSchema),
    saveBuyer: (buyer: Buyer) => write(phone, "buyer", buyer),
    draft: (slug: string): Draft =>
      read(tab, draftKey(slug), draftSchema) ?? emptyDraft,
    saveDraft: (slug: string, draft: Draft) =>
      write(tab, draftKey(slug), draft),
    clearDraft: (slug: string) => write(tab, draftKey(slug), undefined),
    check: (slug: string): KeptCheck | undefined =>
      read(tab, checkKey(slug), keptCheckSchema),
    saveCheck: (slug: string, kept: KeptCheck | undefined) =>
      write(tab, checkKey(slug), kept),
  };
}
