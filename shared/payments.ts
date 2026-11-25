import { z } from "zod";
import { paiseSchema } from "./money.ts";
import { orderPageSchema } from "./orders.ts";

// An order that waits for its required payment holds its space this long.
export const paymentHoldMs = 15 * 60 * 1000;

export const mockResultSchema = z.enum(["pay", "fail"]);
export type MockResult = z.infer<typeof mockResultSchema>;

// The answer of POST /api/payments/:token/start. pay_url is the screen of
// the provider (in this build, the prototype screen /pay/:token); it is null when
// the order is paid already.
export const paymentStartAnswerSchema = z.object({
  paid: z.boolean(),
  amount: paiseSchema,
  pay_url: z.string().startsWith("/").nullable(),
});
export type PaymentStartAnswer = z.infer<typeof paymentStartAnswerSchema>;

// The answer of POST /api/payments/mock/:token/:result.
export const paymentResultAnswerSchema = z.object({
  result: z.enum(["paid", "failed"]),
  order: orderPageSchema,
});
export type PaymentResultAnswer = z.infer<typeof paymentResultAnswerSchema>;
