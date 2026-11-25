import { z } from "zod";
import { appLanguageSchema } from "./languages.ts";

// A Sarvam translation of a text for its reader. The page shows it with the
// "Translated" badge, and the original one tap away (product rule 2).
export const translationSchema = z.object({
  text: z.string().min(1),
  language: appLanguageSchema,
});
export type Translation = z.infer<typeof translationSchema>;
