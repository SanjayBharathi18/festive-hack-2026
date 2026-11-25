import { z } from "zod";

export const appLanguageSchema = z.enum(["en", "hi", "kn", "ta", "te", "mr"]);
export type AppLanguage = z.infer<typeof appLanguageSchema>;

export const sarvamLanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}-IN$/, "must be a Sarvam language code, such as kn-IN");
export type SarvamLanguage = z.infer<typeof sarvamLanguageSchema>;

export function toSarvamLanguage(language: AppLanguage): SarvamLanguage {
  return `${language}-IN`;
}

export function toAppLanguage(code: string): AppLanguage | undefined {
  if (!sarvamLanguageSchema.safeParse(code).success) return undefined;
  const result = appLanguageSchema.safeParse(code.slice(0, -"-IN".length));
  return result.success ? result.data : undefined;
}

export const sarvamLanguageCodes = [
  "hi-IN",
  "bn-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
  "en-IN",
  "gu-IN",
  "as-IN",
  "ur-IN",
  "ne-IN",
  "kok-IN",
  "ks-IN",
  "sd-IN",
  "sa-IN",
  "sat-IN",
  "mni-IN",
  "brx-IN",
  "mai-IN",
  "doi-IN",
] as const;
export const sarvamLanguageCodeSchema = z.enum(sarvamLanguageCodes);
export type SarvamLanguageCode = z.infer<typeof sarvamLanguageCodeSchema>;
