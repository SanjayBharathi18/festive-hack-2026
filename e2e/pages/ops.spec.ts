import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { demoToken } from "./test-env.ts";

// The developer console on /ops, with the simulated NudgeBee incident, on the
// real server with recorded Sarvam answers and the flag defaults. The bad
// override lives in the memory of the shared server, so the spec removes it
// at the end.
const kannada = (
  JSON.parse(
    readFileSync(
      new URL("../../fixtures/sarvam/voice-lines.json", import.meta.url),
      "utf8",
    ),
  ) as { id: string; text: string }[]
).filter(({ id }) => id.startsWith("VK"));

let address = 0;
const readKannada = async (request: APIRequestContext, index: number) => {
  address += 1;
  const response = await request.post("/api/desk/read", {
    headers: {
      "X-Demo-Token": demoToken,
      "Idempotency-Key": randomUUID(),
      "X-Forwarded-For": `198.51.100.${address}`,
    },
    data: {
      text: kannada[index % kannada.length]?.text,
      language: "kn-IN",
      source: "load",
    },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { outcome: string }).outcome;
};

test.afterEach(async ({ request }) => {
  await request.post("/api/ops/reset", {
    headers: { "X-Demo-Token": demoToken },
  });
});

test("the bad override fails Kannada, the alert asks for approval, and Approve brings Kannada back", async ({
  page,
}) => {
  await page.goto(`/ops?demo=${demoToken}&lang=en`);
  await expect(page).not.toHaveURL(/demo=/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Developer console" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "NudgeBee" })).toBeChecked();
  await expect(page.locator(".ops-prototype")).toContainText(
    "NudgeBee is simulated in this prototype",
  );
  await expect(page.locator("#recorded-badge")).toBeVisible();
  const prototype = page.locator(".app-bar #prototype-badge");
  await expect(prototype).toHaveText("Prototype");
  await page.mouse.wheel(0, 2000);
  await expect(prototype).toBeInViewport();
  await page.mouse.wheel(0, -2000);
  const kannadaState = page.locator('tr[data-language="kn-IN"] .ops-state');
  await expect(kannadaState).toBeVisible();

  await page
    .getByRole("button", { name: "Set the bad cfg_sarvam for lang_kn" })
    .click();
  await expect(page.locator("#control-done")).toContainText(
    "The bad cfg_sarvam is set for lang_kn",
  );

  for (let index = 0; index < 12; index += 1) {
    expect(await readKannada(page.request, index)).toBe("invalid");
    if (index >= 4 && (await page.locator("#approve").isVisible())) break;
    if (index >= 4) await page.waitForTimeout(500);
  }
  await expect(kannadaState).toHaveText(/^(Would fire|Firing)/);
  await expect(page.locator("#step-alert")).toContainText(
    "ReadingInvalidRateHigh would fire for Kannada",
  );
  await expect(
    page.getByText("Likely cause: a change of cfg_sarvam"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.locator("#approved")).toContainText(
    "ops_reading is safe for the segment lang_kn, in the memory of this server",
  );
  await expect(page.locator("#approve")).toBeHidden();

  expect(await readKannada(page.request, 0)).toBe("ok");
  expect(await readKannada(page.request, 1)).toBe("ok");
  await expect(page.locator("#recovered")).toBeVisible();
  await expect(page.locator("#recovery-count")).toHaveText(
    /^Readings: \d+\. Invalid: 0\.$/,
  );

  await page.getByRole("button", { name: "Remove both overrides" }).click();
  await expect(page.locator("#control-done")).toContainText(
    "Both overrides are removed",
  );
});

test("the console has three sections: the flags, the incident and the Sarvam calls", async ({
  page,
}) => {
  const section = (name: string) =>
    page.locator(".ops-sections label").filter({ hasText: name });
  await page.goto(`/ops?demo=${demoToken}&lang=en`);
  await expect(page.locator(".ops-audience")).toContainText(
    "not for sellers or buyers",
  );
  await expect(page.locator("#section-nudgebee")).toBeVisible();
  await expect(page.locator("#alert-rules li")).toHaveCount(5);
  await expect(page.locator("#workflow-files")).toContainText(
    "rollback-lang-kn.yaml",
  );

  await section("Flagsmith").click();
  await expect(page).toHaveURL(/#flagsmith$/);
  await expect(page.locator("#section-nudgebee")).toBeHidden();
  await expect(page.locator("#connection-state")).toHaveText(
    "Flag defaults in code: FLAGSMITH_ENVIRONMENT_KEY is not set",
  );
  await expect(page.locator("#flag-rows tr")).toHaveCount(10);
  await expect(
    page.locator('#flag-rows tr[data-flag="cfg_sarvam"] .flag-kind'),
  ).toHaveText("cfg · remote config");
  await expect(page.locator("#segment-rows tr")).toHaveCount(3);
  await expect(page.locator("#overrides-none")).toBeVisible();
  await expect(page.locator("#variation-rows tr")).toHaveCount(2);

  const trigger = await page.request.post("/api/ops/trigger", {
    headers: { "X-Demo-Token": demoToken },
  });
  expect(trigger.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Flagsmith" })).toBeChecked();
  const kannada = page.locator('#segment-rows tr[data-segment="lang_kn"]');
  await expect(kannada.locator(".segment-sarvam")).toContainText(
    "reasoning medium · 256 maximum tokens",
  );
  await expect(kannada.locator('[data-memory="cfg_sarvam"]')).toBeVisible();
  await expect(page.locator("#override-rows")).toContainText(
    "lang_kn · cfg_sarvam",
  );

  expect(await readKannada(page.request, 0)).toBe("invalid");
  await section("Sarvam").click();
  await expect(page).toHaveURL(/#sarvam$/);
  await expect(page.locator("#sarvam-mode")).toHaveText(/^Recorded/);
  await expect(page.locator("#sarvam-key")).toHaveText("Not set");
  await expect(page.locator("#saved-summary")).toContainText("saved answers");
  await expect(page.locator('#call-rows tr[data-api="chat"]')).toBeVisible();
});

test("without the demo token, /ops asks for the demo desk link and does not call the server", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ops/")) {
      calls.push(request.url());
    }
  });
  await page.goto("/ops?lang=en");
  await expect(page.locator("#open-error")).toHaveText(
    "Open this page from the demo desk link.",
  );
  await expect(
    page.getByRole("link", { name: "Go to the desk" }),
  ).toBeVisible();
  await expect(page.locator("#ops-grid")).toBeHidden();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page.waitForTimeout(300);
  expect(calls).toEqual([]);
  await context.close();
});
