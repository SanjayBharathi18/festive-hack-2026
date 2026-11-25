import { createECDH, ECDH } from "node:crypto";
import { z } from "zod";

export type Env = Record<string, string | undefined>;
export type Problem = { variable: string; message: string };
export type Config = Omit<z.output<typeof envSchema>, "PUBLIC_URL"> & {
  PUBLIC_URL: string;
};
export type ConfigResult =
  { ok: true; config: Config } | { ok: false; problems: Problem[] };

const httpUrl = z.url({ protocol: /^https?$/ });

export const envSchema = z.object({
  SARVAM_MODE: z.enum(["live", "recorded"]).default("recorded"),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_BASE_URL: httpUrl.default("https://api.sarvam.ai"),
  FLAGSMITH_ENVIRONMENT_KEY: z.string().optional(),
  FLAGSMITH_API_URL: httpUrl.optional(),
  FLAGSMITH_ADMIN_API_URL: httpUrl.optional(),
  FLAGSMITH_ORG_API_KEY: z.string().optional(),
  FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY: z.string().optional(),
  FLAGSMITH_OPS_READING_FEATURE_ID: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  FLAGSMITH_LANG_KN_SEGMENT_ID: z.coerce.number().int().positive().optional(),
  VAPID_PUBLIC_KEY: z.string().refine(isVapidPublicKey).optional(),
  VAPID_PRIVATE_KEY: z.string().refine(isVapidPrivateKey).optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/)
    .optional(),
  SESSION_SECRET: z.string().min(32),
  DEMO_DESK_TOKEN: z
    .string()
    .regex(/^[\w-]{16,}$/)
    .optional(),
  PUBLIC_URL: httpUrl.optional(),
  PRIVACY_CONTACT: z.string().trim().min(3).max(200).optional(),
  DATA_DIR: z.string().default("./data"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("0.0.0.0"),
});

type Variable = keyof typeof envSchema.shape;

const rules: Record<Variable, string> = {
  SARVAM_MODE: "live or recorded",
  SARVAM_API_KEY: "the key from https://indus.sarvam.ai/key-management",
  SARVAM_BASE_URL: "an http or https URL",
  FLAGSMITH_ENVIRONMENT_KEY: "the server-side key of a Flagsmith environment",
  FLAGSMITH_API_URL: "an http or https URL",
  FLAGSMITH_ADMIN_API_URL: "an http or https URL",
  FLAGSMITH_ORG_API_KEY: "a Flagsmith organisation API key",
  FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY:
    "the client-side key of the live environment, from npm run flagsmith-setup",
  FLAGSMITH_OPS_READING_FEATURE_ID:
    "the ops_reading feature id, from npm run flagsmith-setup",
  FLAGSMITH_LANG_KN_SEGMENT_ID:
    "the lang_kn segment id, from npm run flagsmith-setup",
  VAPID_PUBLIC_KEY:
    "a P-256 public key in base64url, 65 bytes (run npm run vapid)",
  VAPID_PRIVATE_KEY:
    "a P-256 private key in base64url, 32 bytes (run npm run vapid)",
  VAPID_SUBJECT: "a mailto: address or an https:// URL",
  SESSION_SECRET:
    "32 or more random characters (.env.example shows a command that makes them)",
  DEMO_DESK_TOKEN: "16 or more letters, digits, - or _",
  PUBLIC_URL: "the http or https address of the app",
  PRIVACY_CONTACT:
    "the address or number for privacy complaints, 3 to 200 characters",
  DATA_DIR: "a folder path",
  PORT: "a whole number from 1 to 65535",
  HOST: "a host name or an IP address",
};

const vapidVariables = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

export function parseConfig(env: Env): ConfigResult {
  const variables = presentVariables(env);
  const result = envSchema.safeParse(variables);
  const problems = [
    ...(result.error?.issues.map((issue) => describe(issue, variables)) ?? []),
    ...crossProblems(variables),
  ];
  if (!result.success || problems.length > 0) return { ok: false, problems };
  const values = result.data;
  const publicUrl = values.PUBLIC_URL ?? `http://localhost:${values.PORT}`;
  return {
    ok: true,
    config: { ...values, PUBLIC_URL: publicUrl.replace(/\/+$/, "") },
  };
}

export function presentVariables(env: Env): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[1].trim() !== "",
    ),
  );
}

export function isVapidPublicKey(value: string): boolean {
  const bytes = base64urlBytes(value);
  if (bytes?.length !== 65 || bytes[0] !== 0x04) return false;
  try {
    ECDH.convertKey(bytes, "prime256v1");
    return true;
  } catch {
    return false;
  }
}

export function isVapidPrivateKey(value: string): boolean {
  return base64urlBytes(value)?.length === 32;
}

export function vapidPairMatches(
  publicKey: string,
  privateKey: string,
): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, "base64url"));
  } catch {
    return false;
  }
}

function crossProblems(variables: Record<string, string>): Problem[] {
  const problems: Problem[] = [];
  if (
    variables.SARVAM_MODE === "live" &&
    variables.SARVAM_API_KEY === undefined
  ) {
    problems.push({
      variable: "SARVAM_API_KEY",
      message:
        "missing. SARVAM_MODE is live, so set the key, or set SARVAM_MODE=recorded",
    });
  }
  const missingVapid = vapidVariables.filter(
    (name) => variables[name] === undefined,
  );
  if (missingVapid.length > 0 && missingVapid.length < vapidVariables.length) {
    for (const variable of missingVapid) {
      problems.push({
        variable,
        message:
          "missing. Set all three VAPID variables (npm run vapid), or none",
      });
    }
  }
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } =
    variables;
  if (
    publicKey !== undefined &&
    privateKey !== undefined &&
    isVapidPublicKey(publicKey) &&
    isVapidPrivateKey(privateKey) &&
    !vapidPairMatches(publicKey, privateKey)
  ) {
    problems.push({
      variable: "VAPID_PRIVATE_KEY",
      message:
        "does not match VAPID_PUBLIC_KEY. Run npm run vapid and copy all three lines",
    });
  }
  return problems;
}

function describe(
  issue: z.core.$ZodIssue,
  variables: Record<string, string>,
): Problem {
  const variable = String(issue.path[0]);
  const rule = rules[variable as Variable];
  return variables[variable] === undefined
    ? { variable, message: `missing. Set ${rule} in .env` }
    : { variable, message: `must be ${rule}` };
}

function base64urlBytes(value: string): Buffer | undefined {
  return /^[\w-]+$/.test(value) ? Buffer.from(value, "base64url") : undefined;
}
