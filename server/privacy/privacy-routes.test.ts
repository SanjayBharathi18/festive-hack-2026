import assert from "node:assert/strict";
import { test } from "node:test";
import { privacyAnswerSchema } from "../../shared/privacy.ts";
import { parseConfig } from "../config.ts";
import { createTestApp } from "../test-app.ts";

test("the privacy page gets the complaint contact, or null when it is not set", async () => {
  const unset = createTestApp();
  const none = await unset.app.request("/api/privacy");
  assert.equal(none.status, 200);
  assert.deepEqual(privacyAnswerSchema.parse(await none.json()), {
    contact: null,
  });
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    PRIVACY_CONTACT: "privacy@example.org",
  });
  assert.ok(parsed.ok);
  const set = createTestApp({ config: parsed.config });
  const answer = await set.app.request("/api/privacy");
  assert.deepEqual(privacyAnswerSchema.parse(await answer.json()), {
    contact: "privacy@example.org",
  });
});
