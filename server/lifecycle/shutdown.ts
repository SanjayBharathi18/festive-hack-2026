import type { Server } from "node:http";
import type { MiddlewareHandler } from "hono";
import type { Db } from "../db/database.ts";
import type { AppEnv } from "../http/context.ts";
import { errorResponse } from "../http/errors.ts";
import type { Log } from "../log.ts";

export type ShutdownHook = (signal: AbortSignal) => unknown;

export type Shutdown = {
  signal: AbortSignal;
  isShuttingDown: () => boolean;
  onShutdown: (hook: ShutdownHook) => void;
  run: (reason: string) => Promise<void>;
};

export type ShutdownOptions = {
  server: Server;
  db: Db;
  log: Log;
  exit: (code: number) => void;
  drainMs?: number;
  hookMs?: number;
};

export function createShutdown({
  server,
  db,
  log,
  exit,
  drainMs = 20_000,
  hookMs = 5_000,
}: ShutdownOptions): Shutdown {
  const controller = new AbortController();
  const hooks: ShutdownHook[] = [];
  let running: Promise<void> | undefined;

  async function stop(reason: string): Promise<void> {
    log({ msg: "shutdown started", reason });
    controller.abort();
    const drained = await closeServer(server, drainMs);
    const results = await Promise.allSettled(
      hooks.map((hook) => withDeadline(hook, hookMs)),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        log({ msg: "shutdown hook failed", error: String(result.reason) });
      }
    }
    db.close();
    log({ msg: "shutdown finished", drained });
    exit(0);
  }

  return {
    signal: controller.signal,
    isShuttingDown: () => controller.signal.aborted,
    onShutdown: (hook) => {
      hooks.push(hook);
    },
    run: (reason) => (running ??= stop(reason)),
  };
}

export function stopNewRequests(
  isShuttingDown: () => boolean,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (isShuttingDown()) {
      c.header("Connection", "close");
      return errorResponse(
        c,
        503,
        "shutting_down",
        "The server is restarting. Try again in a few seconds.",
      );
    }
    await next();
    if (isShuttingDown()) c.header("Connection", "close");
  };
}

function closeServer(server: Server, deadlineMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      resolve(false);
    }, deadlineMs);
    server.close(() => {
      clearTimeout(deadline);
      resolve(true);
    });
    server.closeIdleConnections();
  });
}

async function withDeadline(hook: ShutdownHook, ms: number): Promise<void> {
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error(`The hook did not finish within ${ms} ms.`)),
    ms,
  );
  const late = new Promise<never>((_, reject) =>
    deadline.signal.addEventListener(
      "abort",
      () => reject(deadline.signal.reason),
      { once: true },
    ),
  );
  try {
    await Promise.race([hook(deadline.signal), late]);
  } finally {
    clearTimeout(timer);
  }
}
