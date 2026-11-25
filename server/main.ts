import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { collectDefaultMetrics } from "prom-client";
import { createApp } from "./app.ts";
import { systemClock } from "./clock.ts";
import { parseConfig } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { startDemoRefresh } from "./demo/refresh.ts";
import { createFlags } from "./flags/flagsmith-flags.ts";
import { createShutdown } from "./lifecycle/shutdown.ts";
import { createLog } from "./log.ts";
import { createMetrics } from "./metrics/metrics.ts";
import { createPageReader } from "./pages/page-routes.ts";
import { savedRecordings, summarizeRecordings } from "./sarvam/recorded.ts";
import { createSarvam } from "./sarvam/sarvam.ts";

const dev = process.argv.includes("--dev");
const parsed = parseConfig(process.env);
if (!parsed.ok) {
  console.error(
    [
      "The configuration is not valid:",
      ...parsed.problems.map(
        ({ variable, message }) => `- ${variable} ${message}`,
      ),
      "Fix .env (or the deploy secrets), then start again. npm run doctor checks each setting.",
    ].join("\n"),
  );
  process.exit(1);
}
const { config } = parsed;

const clock = systemClock;
const log = createLog((line) => process.stdout.write(`${line}\n`), clock);
mkdirSync(config.DATA_DIR, { recursive: true });
const db = openDatabase(join(config.DATA_DIR, "app.db"));
const metrics = createMetrics();
collectDefaultMetrics({ register: metrics.registry });
const server = createServer();
const shutdown = createShutdown({
  server,
  db,
  log,
  exit: (code) => process.exit(code),
});
const flags = createFlags(config, { log, clock });
shutdown.onShutdown(() => flags.close(5000));
startDemoRefresh({ db, clock, log, stopping: shutdown.signal });
const sarvam = createSarvam(config);
if (sarvam.mode === "recorded") {
  log({
    msg: "recorded Sarvam answers",
    ...summarizeRecordings(savedRecordings()),
  });
}

const vite = dev
  ? await (
      await import("vite")
    ).createServer({
      server: {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: [new URL(config.PUBLIC_URL).hostname, "localhost"],
      },
    })
  : undefined;
shutdown.signal.addEventListener("abort", () => void vite?.close());

const dist = new URL("../dist/", import.meta.url);
const app = createApp({
  config,
  db,
  clock,
  log,
  metrics,
  isShuttingDown: shutdown.isShuttingDown,
  stopping: shutdown.signal,
  flags,
  sarvam,
  readPage: vite
    ? createPageReader(new URL("../src/", import.meta.url), (url, html) =>
        vite.transformIndexHtml(url, html),
      )
    : createPageReader(dist),
  assetsDir: vite ? undefined : fileURLToPath(dist),
});

const listener = getRequestListener(app.fetch);
server.on(
  "request",
  vite
    ? (request, response) =>
        vite.middlewares(request, response, () => listener(request, response))
    : listener,
);
server.on("error", (error) => {
  log({ msg: "the server cannot listen", error: String(error) });
  process.exit(1);
});
server.listen(config.PORT, config.HOST, () => {
  log({
    msg: "listening",
    address: `http://${config.HOST}:${config.PORT}`,
    public_url: config.PUBLIC_URL,
    mode: dev ? "dev" : "production",
    sarvam_mode: config.SARVAM_MODE,
  });
  // A person at a terminal gets one plain line; containers keep pure JSON logs.
  if (process.stdout.isTTY) {
    process.stdout.write(
      `\nThe app runs at ${config.PUBLIC_URL} . To stop it, push Ctrl+C.\nThe lines in braces are the request log: one line for each request.\n\n`,
    );
  }
});
process.once("SIGTERM", () => void shutdown.run("SIGTERM"));
process.once("SIGINT", () => void shutdown.run("SIGINT"));
