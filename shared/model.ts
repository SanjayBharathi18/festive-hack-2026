import { z } from "zod";

export const orderStatusSchema = z.enum([
  "awaiting_payment",
  "new",
  "making",
  "ready",
  "delivered",
  "picked_up",
  "cancelled",
  "expired",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderSourceSchema = z.enum([
  "link",
  "marketplace",
  "desk",
  "load",
]);
export type OrderSource = z.infer<typeof orderSourceSchema>;

export const fulfilmentSchema = z.enum(["pickup", "delivery"]);
export type Fulfilment = z.infer<typeof fulfilmentSchema>;

export const vegMarkSchema = z.enum(["veg", "non_veg", "egg"]);
export type VegMark = z.infer<typeof vegMarkSchema>;

export const categorySchema = z.enum([
  "sweets",
  "snacks",
  "savouries",
  "meals",
]);
export type Category = z.infer<typeof categorySchema>;

export const limitUnitSchema = z.enum(["orders", "kg", "pieces"]);
export type LimitUnit = z.infer<typeof limitUnitSchema>;
