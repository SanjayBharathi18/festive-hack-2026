import { z } from "zod";
import { daySchema } from "./day.ts";
import { appLanguageSchema, sarvamLanguageSchema } from "./languages.ts";
import {
  fulfilmentSchema,
  limitUnitSchema,
  orderSourceSchema,
  orderStatusSchema,
  vegMarkSchema,
} from "./model.ts";
import { paiseSchema } from "./money.ts";
import { phoneSchema } from "./phone.ts";
import { readVariantSchema } from "./reading.ts";
import { cartLineSchema, dayReasonSchema } from "./store.ts";
import { translationSchema } from "./translation.ts";

export const cancelReasonSchema = z.enum([
  "cant_deliver",
  "item_ran_out",
  "day_full",
  "other",
]);
export type CancelReason = z.infer<typeof cancelReasonSchema>;

export const stampSchema = z.enum([
  "new",
  "making",
  "ready",
  "delivered",
  "picked_up",
]);
export type Stamp = z.infer<typeof stampSchema>;

export const undoWindowMs = 10_000;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const optionalPhone = phoneSchema.nullish().transform((value) => value ?? null);

const uniquePacks = (cart: readonly { pack_id: string }[]) =>
  new Set(cart.map((line) => line.pack_id)).size === cart.length;
const cart = <Line extends z.ZodType<{ pack_id: string }>>(line: Line) =>
  z.array(line).min(1).max(100).refine(uniquePacks, "must list each pack once");

export const checkoutLineSchema = cartLineSchema.extend({ price: paiseSchema });
export type CheckoutLine = z.infer<typeof checkoutLineSchema>;

export const giftSchema = z.object({
  name: requiredText(80),
  phone: optionalPhone,
  message: optionalText(300),
});

export const checkoutBodySchema = z
  .object({
    store_id: z.uuid(),
    proof: z.string().min(32).max(64),
    via: z.string().max(40).nullish(),
    day: daySchema,
    fulfilment: fulfilmentSchema,
    address: optionalText(300),
    gift: giftSchema.nullish().transform((gift) => gift ?? null),
    note: optionalText(500),
    buyer_name: requiredText(80),
    buyer_language: appLanguageSchema.default("en"),
    cart: cart(checkoutLineSchema),
  })
  .superRefine((body, context) => {
    if (body.fulfilment === "delivery" && body.address === null) {
      context.addIssue({
        code: "custom",
        path: ["address"],
        message: "is needed for delivery",
      });
    }
    if (body.fulfilment === "pickup" && body.gift !== null) {
      context.addIssue({
        code: "custom",
        path: ["gift"],
        message: "is for delivery only",
      });
    }
  });
export type CheckoutBody = z.input<typeof checkoutBodySchema>;

export const deskReadingSchema = z.object({
  order_id: z.uuid(),
  transcript: z.string().max(20_000),
  language: sarvamLanguageSchema.nullable(),
  variant: readVariantSchema.nullable(),
  edited: z.boolean(),
});

const deskOrderFields = {
  day: daySchema,
  fulfilment: fulfilmentSchema,
  address: optionalText(300),
  note: optionalText(500),
  buyer_name: optionalText(80),
  buyer_phone: optionalPhone,
  cart: cart(cartLineSchema),
};

export const deskOrderBodySchema = z.object({
  ...deskOrderFields,
  source: z.enum(["desk", "load"]).default("desk"),
  buyer_language: appLanguageSchema
    .nullish()
    .transform((value) => value ?? null),
  reading: deskReadingSchema.nullish().transform((value) => value ?? null),
});
export type DeskOrderBody = z.input<typeof deskOrderBodySchema>;

export const deskOrderPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stamp"), status: stampSchema }),
  z.object({ action: z.literal("paid"), paid: z.boolean() }),
  z.object({ action: z.literal("cancel"), reason: cancelReasonSchema }),
  z.object({ action: z.literal("edit"), ...deskOrderFields }),
]);
export type DeskOrderPatch = z.input<typeof deskOrderPatchSchema>;

const pricedLineSchema = z.object({
  item_id: z.string(),
  pack_id: z.string().nullable(),
  name: z.string(),
  label: z.string(),
  quantity: z.int().positive(),
  price: paiseSchema,
  grams: z.int().positive().nullable(),
  pieces: z.int().positive().nullable(),
});
// A line as the server prices and keeps it.
export type OrderLine = z.infer<typeof pricedLineSchema>;

// A line as the pages get it: with the food mark and the Latin name of its
// dish, from her menu.
export const orderLineSchema = pricedLineSchema.extend({
  veg_mark: vegMarkSchema,
  name_latin: z.string().min(1).nullable(),
});
export type ShownLine = z.infer<typeof orderLineSchema>;

// A line on the buyer's order page: with its dish name in the script of the
// buyer of GET /api/orders/:token?lang=, when it differs from name.
export const orderPageLineSchema = orderLineSchema.extend({
  name_script: z.string().min(1).nullable(),
});

export const orderMessageSchema = z.object({
  template: z.string(),
  language: appLanguageSchema,
  body: z.string(),
  channel: z.enum(["simulated", "whatsapp"]),
  created_at: z.int(),
});
export type OrderMessage = z.infer<typeof orderMessageSchema>;

// online: the store takes online payments, so the order page offers Pay
// online. pay_by: the end of the 15 minutes in which an order that waits for
// its required payment holds its space.
export const orderPaymentSchema = z.object({
  online: z.boolean(),
  refunded: z.boolean(),
  pay_by: z.int().nullable(),
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;

export const orderPageSchema = z.object({
  number: z.int().positive(),
  status: orderStatusSchema,
  paid: z.boolean(),
  payment_required: z.boolean(),
  day: daySchema,
  fulfilment: fulfilmentSchema,
  total: paiseSchema,
  lines: z.array(orderPageLineSchema),
  buyer_name: z.string().nullable(),
  address: z.string().nullable(),
  gift: z
    .object({ name: z.string(), message: z.string().nullable() })
    .nullable(),
  note: z.string().nullable(),
  cancel_reason: cancelReasonSchema.nullable(),
  created_at: z.int(),
  store: z.object({
    slug: z.string(),
    name: z.string(),
    area: z.string().nullable(),
    city: z.string().nullable().optional(),
    is_demo: z.boolean(),
    message_url: z.url(),
    pickup: z
      .object({ address: z.string().nullable(), map_url: z.url().nullable() })
      .nullable(),
  }),
  messages: z.array(orderMessageSchema),
  payment: orderPaymentSchema,
});
export type OrderPage = z.infer<typeof orderPageSchema>;

export const checkoutAnswerSchema = z.object({
  token: z.string(),
  order: orderPageSchema,
});
export type CheckoutAnswer = z.infer<typeof checkoutAnswerSchema>;

export const deskSlipSchema = z.object({
  id: z.uuid(),
  number: z.int().positive(),
  token: z.string(),
  order_url: z.url(),
  share_url: z.url().nullable(),
  status: orderStatusSchema,
  next_stamp: stampSchema.nullable(),
  paid: z.boolean(),
  // True once she refunded an online payment of the order.
  refunded: z.boolean(),
  // The last refund of the order, in cash or online, once she refunded it.
  refund: z.object({ amount: paiseSchema, online: z.boolean() }).nullable(),
  payment_required: z.boolean(),
  source: orderSourceSchema,
  fulfilment: fulfilmentSchema,
  day: daySchema,
  total: paiseSchema,
  lines: z.array(orderLineSchema),
  buyer_name: z.string().nullable(),
  buyer_phone: z.string().nullable(),
  buyer_language: appLanguageSchema.nullable(),
  address: z.string().nullable(),
  gift: z
    .object({
      name: z.string(),
      phone: z.string().nullable(),
      message: z.string().nullable(),
    })
    .nullable(),
  note: z.string().nullable(),
  note_translation: translationSchema.nullable(),
  cancel_reason: cancelReasonSchema.nullable(),
  reading: z
    .object({
      language: z.string().nullable(),
      variant: readVariantSchema.nullable(),
      edited: z.boolean(),
    })
    .nullable(),
  messages: z.array(orderMessageSchema),
  created_at: z.int(),
});
export type DeskSlip = z.infer<typeof deskSlipSchema>;

export const dayWarningSchema = z.object({
  day: daySchema,
  reason: dayReasonSchema,
  space_left: z.int().nonnegative().nullable(),
  next_free_day: daySchema.nullable(),
});
export type DayWarning = z.infer<typeof dayWarningSchema>;

export const deskOrderAnswerSchema = z.object({
  order: deskSlipSchema,
  warning: dayWarningSchema.nullable(),
});
export type DeskOrderAnswer = z.infer<typeof deskOrderAnswerSchema>;

// Change order checks the day before it saves: the warning for the changed
// order, or none when its day still has space for it.
export const deskDayCheckBodySchema = z.object({
  day: daySchema,
  cart: cart(cartLineSchema),
});
export type DeskDayCheckBody = z.input<typeof deskDayCheckBodySchema>;

export const deskDayCheckAnswerSchema = z.object({
  warning: dayWarningSchema.nullable(),
});

// Undo of a desk order saved a moment ago: the order is gone.
export const deskRemovedSchema = z.object({ removed: z.uuid() });

export const deskRangeSchema = z
  .object({ from: daySchema.optional(), to: daySchema.optional() })
  .refine(
    ({ from, to }) => from === undefined || to === undefined || from <= to,
    { message: "must not end before it starts", path: ["to"] },
  );

const dayLoadFields = {
  day: daySchema,
  load: z.int().nonnegative(),
  space_left: z.int().nonnegative().nullable(),
};

export const deskBoardSchema = z.object({
  today: daySchema,
  limit_unit: limitUnitSchema,
  daily_limit: z.int().positive().nullable(),
  days: z.array(z.object({ ...dayLoadFields, slips: z.array(deskSlipSchema) })),
});
export type DeskBoard = z.infer<typeof deskBoardSchema>;

const moneyFields = {
  value: paiseSchema,
  paid: paiseSchema,
  owed: paiseSchema,
};

export const dailyItemSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  grams: z.int().nonnegative().nullable(),
  pieces: z.int().nonnegative().nullable(),
  packs: z.array(z.object({ label: z.string(), quantity: z.int().positive() })),
});
export type DailyItem = z.infer<typeof dailyItemSchema>;

export const dailyListSchema = z.object({
  today: daySchema,
  limit_unit: limitUnitSchema,
  daily_limit: z.int().positive().nullable(),
  days: z.array(
    z.object({
      ...dayLoadFields,
      closed: z.boolean(),
      orders: z.int().nonnegative(),
      items: z.array(dailyItemSchema),
      ...moneyFields,
    }),
  ),
  last_30_days: z.object({
    from: daySchema,
    to: daySchema,
    orders: z.int().nonnegative(),
    ...moneyFields,
  }),
});
export type DailyList = z.infer<typeof dailyListSchema>;
