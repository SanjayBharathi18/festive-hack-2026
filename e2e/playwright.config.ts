import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { demoToken, pagesPort } from "./pages/test-env.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const modulesPort = 5179;
const ci = Boolean(process.env.CI);
const pagesData = mkdtempSync(join(tmpdir(), "e2e-pages-"));

export default defineConfig({
  testDir: ".",
  outputDir: "../test-results",
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // The page specs share one server and one database, and the incident spec
  // changes flags in the server's memory, so the specs run one at a time.
  workers: 1,
  reporter: ci
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "../playwright-report" }],
      ]
    : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      // The browser modules load as source from the Vite dev server, with no
      // app server, database or keys.
      name: "modules",
      testMatch: "modules/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${modulesPort}`,
      },
    },
    {
      // The pages run on the real server in dev mode, with a fresh database,
      // recorded Sarvam answers and the flag defaults, at a laptop's width.
      name: "pages",
      testMatch: "pages/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${pagesPort}`,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${modulesPort} --strictPort --host 127.0.0.1`,
      cwd: root,
      port: modulesPort,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: "node server/main.ts --dev",
      cwd: root,
      port: pagesPort,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(pagesPort),
        HOST: "127.0.0.1",
        PUBLIC_URL: `http://127.0.0.1:${pagesPort}`,
        DATA_DIR: pagesData,
        SESSION_SECRET: "e2e-session-secret-of-at-least-32-chars",
        DEMO_DESK_TOKEN: demoToken,
        SARVAM_MODE: "recorded",
        SARVAM_API_KEY: "",
        FLAGSMITH_ENVIRONMENT_KEY: "",
      },
    },
  ],
});
