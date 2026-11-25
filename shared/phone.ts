import { z } from "zod";

export const phoneSchema = z
  .string()
  .max(32)
  .transform(toE164)
  .pipe(
    z
      .string()
      .regex(
        /^\+(91[6-9]\d{9}|910{5}\d{5}|(?!91)[1-9]\d{7,14})$/,
        "must be a WhatsApp number, such as 98765 43210 or +44 7700 900123",
      ),
  );
export type Phone = z.output<typeof phoneSchema>;

export function toE164(input: string): string {
  const compact = input.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) return compact;
  if (/^0{5}\d{5}$/.test(compact)) return `+91${compact}`;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (/^[6-9]\d{9}$/.test(compact)) return `+91${compact}`;
  if (/^0[6-9]\d{9}$/.test(compact)) return `+91${compact.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}
