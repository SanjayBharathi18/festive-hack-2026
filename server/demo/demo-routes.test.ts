import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "../config.ts";
import { createTestApp } from "../test-app.ts";
import { demoEntries } from "./demo-routes.ts";

const token = "start-page-token-0123456789";

test("the desk and console buttons of the start page redirect with the demo token, in English, uncached", async () => {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    DEMO_DESK_TOKEN: token,
  });
  assert.ok(parsed.ok);
  const { app } = createTestApp({ config: parsed.config });
  for (const [path, page] of Object.entries(demoEntries)) {
    const response = await app.request(path);
    assert.equal(response.status, 302, path);
    assert.equal(
      response.headers.get("Location"),
      `${page}?lang=en&demo=${token}`,
    );
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  }
});

test("with no demo token set, the buttons open the desk and the console as they are", async () => {
  const { app } = createTestApp();
  for (const [path, page] of Object.entries(demoEntries)) {
    const response = await app.request(path);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get("Location"), `${page}?lang=en`);
  }
});
