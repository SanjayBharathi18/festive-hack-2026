import { setTimeout as sleep } from "node:timers/promises";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { deskAuth } from "../verify/desk-auth.ts";
import type { DeskEvent } from "./hub.ts";

type EventDeps = Pick<
  RouteDeps,
  "db" | "clock" | "config" | "stopping" | "events"
>;

export const heartbeatMs = 20_000;
const reconnectMs = 3_000;

export function eventRoutes(
  { db, clock, config, stopping, events }: EventDeps,
  { heartbeat = heartbeatMs }: { heartbeat?: number } = {},
): Hono<AppEnv> {
  return new Hono<AppEnv>().get(
    "/api/desk/events",
    deskAuth({ db, clock, config }),
    (c) => {
      const { storeId } = c.get("desk");
      return streamSSE(c, async (stream) => {
        const gone = new AbortController();
        const end = () => gone.abort();
        stream.onAbort(end);
        stopping.addEventListener("abort", end, { once: true });
        if (stopping.aborted) end();
        const ended = gone.signal;
        const unsubscribe = events.subscribe(storeId, (event) => {
          void stream.writeSSE({ event: event.type, data: dataOf(event) });
        });
        try {
          await stream.writeSSE({
            event: "heartbeat",
            data: String(clock.now()),
            retry: reconnectMs,
          });
          while (!ended.aborted) {
            await sleep(heartbeat, undefined, { signal: ended }).catch(
              () => undefined,
            );
            if (ended.aborted) break;
            await stream.writeSSE({
              event: "heartbeat",
              data: String(clock.now()),
            });
          }
        } finally {
          unsubscribe();
          stopping.removeEventListener("abort", end);
        }
      });
    },
  );
}

function dataOf(event: DeskEvent): string {
  switch (event.type) {
    case "order_created":
    case "order_changed":
      return JSON.stringify(event.order);
    case "order_removed":
      return JSON.stringify({ id: event.order_id });
    case "quote_created":
      return JSON.stringify({ id: event.quote_id });
  }
}
