import { z } from "zod";
import { phoneSchema } from "./phone.ts";

export const codePurposeSchema = z.enum([
  "order",
  "desk",
  "publish",
  "work_email",
]);
export type CodePurpose = z.infer<typeof codePurposeSchema>;

export const codeSchema = z
  .string()
  .transform((code) => code.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "must be the 6-digit code"));

export const verifyStartBodySchema = z.object({
  phone: phoneSchema,
  purpose: codePurposeSchema,
});
export type VerifyStartBody = z.input<typeof verifyStartBodySchema>;

export const verifyStartAnswerSchema = z.object({
  prototype: z.literal(true),
  code: z.string().regex(/^\d{6}$/),
  expires_at: z.int(),
});
export type VerifyStartAnswer = z.infer<typeof verifyStartAnswerSchema>;

export const verifyCheckBodySchema = z.object({
  phone: phoneSchema,
  purpose: codePurposeSchema,
  code: codeSchema,
});
export type VerifyCheckBody = z.input<typeof verifyCheckBodySchema>;

export const verifyCheckAnswerSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("order"),
    proof: z.string().min(32),
    expires_at: z.int(),
  }),
  z.object({
    purpose: z.literal("desk"),
    store: z.object({ slug: z.string(), name: z.string() }),
  }),
  z.object({
    purpose: z.literal("publish"),
    store: z
      .object({
        id: z.uuid(),
        slug: z.string(),
        name: z.string(),
        published: z.boolean(),
      })
      .nullable(),
  }),
]);
export type VerifyCheckAnswer = z.infer<typeof verifyCheckAnswerSchema>;
