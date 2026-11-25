import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FlagValues } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import { parseConfig } from "../config.ts";
import { seedDemo, stableId } from "../demo/seed.ts";
import { createTestApp } from "../test-app.ts";
import { orderProof, postJson, signIn } from "../verify/test-sign-in.ts";

export const daawatSlug = "daawat-caterers";
export const gharSlug = "ghar-ki-mithai";
export const daawatPhone = "+910000000008";
export const gharPhone = "+910000000003";

// The demo seed on a test app, with translation off so that no route waits
// for Sarvam, and helpers for buyers and sellers.
export function quoteApp(flagValues: Partial<FlagValues> = {}) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    PUBLIC_URL: "https://34-12-56-78.sslip.io",
  });
  assert.ok(parsed.ok);
  const test = createTestApp({
    config: parsed.config,
    flags: createDefaultFlags({ ops_translation: "off", ...flagValues }),
  });
  const seed = seedDemo(test.deps.db, test.deps.clock);
  const storeId = (slug: string): string => {
    const id = seed.storeIds[slug];
    assert.ok(id, slug);
    return id;
  };
  const packageId = (key: string) => stableId("package", daawatSlug, key);
  let buyers = 0;
  const proof = async (): Promise<{ proof: string; phone: string }> => {
    buyers += 1;
    const phone = `+9198765${String(buyers).padStart(5, "0")}`;
    return {
      phone,
      proof: await orderProof(test.app, phone, {
        "X-Forwarded-For": `198.51.100.${buyers}`,
      }),
    };
  };
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    postJson(test.app, path, body, {
      "Idempotency-Key": randomUUID(),
      ...headers,
    });
  const send = (
    method: string,
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    Promise.resolve(
      test.app.request(path, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
  const sellerCookie = (phone: string) => signIn(test.app, phone);
  return { ...test, seed, storeId, packageId, proof, post, send, sellerCookie };
}
