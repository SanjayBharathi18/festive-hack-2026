import { z } from "zod";

// GET /api/privacy: where a buyer writes to complain, from PRIVACY_CONTACT.
// null: she writes to the store on WhatsApp.
export const privacyAnswerSchema = z.object({
  contact: z.string().min(1).nullable(),
});
export type PrivacyAnswer = z.infer<typeof privacyAnswerSchema>;
