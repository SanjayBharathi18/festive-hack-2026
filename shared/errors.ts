import { z } from "zod";

export const errorCodeSchema = z.enum([
  "invalid_input",
  "idempotency_key_missing",
  "idempotency_key_in_use",
  "idempotency_key_reused",
  "not_found",
  "payload_too_large",
  "unsupported_media_type",
  "forbidden",
  "rate_limited",
  "internal_error",
  "timeout",
  "not_ready",
  "shutting_down",
  "not_signed_in",
  "seller_not_found",
  "code_wrong",
  "code_expired",
  "code_used",
  "code_tries_used",
  "proof_invalid",
  "store_not_taking_orders",
  "fulfilment_unavailable",
  "item_unavailable",
  "item_sold_out",
  "price_changed",
  "day_full",
  "day_closed",
  "day_past",
  "day_too_far",
  "order_exists",
  "stamp_not_allowed",
  "order_closed",
  "audio_invalid",
  "voice_off",
  "speech_failed",
  "recording_missing",
  "parts_expired",
  "no_words",
  "use_refund",
  "use_demo_link",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    request_id: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
