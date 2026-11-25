import { z } from "zod";
import { deskSlipSchema, type DeskSlip } from "../../shared/orders.ts";

export type LiveStatus = "connecting" | "live" | "offline";

export type LiveSource = {
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void,
  ): void;
  close(): void;
};

// The browser's own word on the network: navigator.onLine, and the online
// and offline events of the window.
export type Network = {
  readonly onLine: boolean;
  addEventListener(type: "online" | "offline", listener: () => void): void;
};

export type Live = {
  readonly status: LiveStatus;
  // Connect again now, for example when the laptop is back online.
  wake(): void;
};

const closed = 2;
const slipEvents = ["order_created", "order_changed"] as const;
const idEvents = ["order_removed", "quote_created"] as const;
const idSchema = z.object({ id: z.uuid() });
export const retryMs = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

// New and changed orders, orders taken back with Undo and new quote requests
// arrive from the server as they happen. The browser reconnects by itself
// after a dropped line; after a refused or failed connection, this module
// tries again with a growing pause. Each new connection after a loss asks
// the page to load the board again, because events may have been missed in
// between. With no network the status says so at once, whatever the line
// thinks, and the network coming back opens a fresh line.
export function connectLive({
  url,
  open,
  network,
  onSlip,
  onRemoved,
  onQuote,
  onStatus,
  onGap,
  signal,
}: {
  url: string;
  open: (url: string) => LiveSource;
  network: Network;
  onSlip: (slip: DeskSlip) => void;
  onRemoved: (id: string) => void;
  onQuote: (id: string) => void;
  onStatus: (status: LiveStatus) => void;
  onGap: () => void;
  signal: AbortSignal;
}): Live {
  let line: LiveStatus = "connecting";
  let shown = shownStatus(line, network.onLine);
  let source: LiveSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let lost = false;

  const show = () => {
    const next = shownStatus(line, network.onLine);
    if (next === shown) return;
    shown = next;
    onStatus(next);
  };
  const setLine = (next: LiveStatus) => {
    line = next;
    show();
  };

  const connect = () => {
    clearTimeout(retry);
    retry = undefined;
    if (signal.aborted) return;
    const current = open(url);
    source = current;
    current.addEventListener("open", () => {
      if (source !== current) return;
      failures = 0;
      setLine("live");
      if (lost) onGap();
      lost = false;
    });
    current.addEventListener("error", () => {
      if (source !== current) return;
      lost = true;
      if (current.readyState !== closed) {
        setLine("connecting");
        return;
      }
      setLine("offline");
      current.close();
      source = undefined;
      const pause = retryMs[Math.min(failures, retryMs.length - 1)];
      failures += 1;
      retry = setTimeout(connect, pause);
    });
    for (const type of slipEvents) {
      current.addEventListener(type, (event) => {
        const slip = parseSlip(event.data);
        if (slip === undefined) {
          console.error(`The desk got a ${type} event it cannot read.`);
          onGap();
          return;
        }
        onSlip(slip);
      });
    }
    for (const type of idEvents) {
      current.addEventListener(type, (event) => {
        const id = parseId(event.data);
        if (id === undefined) {
          console.error(`The desk got a ${type} event it cannot read.`);
          onGap();
          return;
        }
        if (type === "order_removed") onRemoved(id);
        else onQuote(id);
      });
    }
  };

  const reconnect = () => {
    if (signal.aborted) return;
    source?.close();
    source = undefined;
    failures = 0;
    setLine("connecting");
    connect();
  };

  network.addEventListener("offline", () => {
    lost = true;
    show();
  });
  network.addEventListener("online", reconnect);
  signal.addEventListener(
    "abort",
    () => {
      clearTimeout(retry);
      source?.close();
      source = undefined;
    },
    { once: true },
  );
  connect();

  return {
    get status() {
      return shown;
    },
    wake() {
      if (source === undefined && !signal.aborted) connect();
    },
  };
}

export function shownStatus(line: LiveStatus, online: boolean): LiveStatus {
  return online ? line : "offline";
}

export function parseSlip(data: unknown): DeskSlip | undefined {
  return parseJson(data, deskSlipSchema);
}

function parseId(data: unknown): string | undefined {
  return parseJson(data, idSchema)?.id;
}

function parseJson<T>(data: unknown, schema: z.ZodType<T>): T | undefined {
  if (typeof data !== "string") return undefined;
  try {
    const result = schema.safeParse(JSON.parse(data));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
