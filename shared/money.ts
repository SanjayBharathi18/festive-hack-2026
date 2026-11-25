import { z } from "zod";

export const paiseSchema = z.int().nonnegative();
export type Paise = z.infer<typeof paiseSchema>;
