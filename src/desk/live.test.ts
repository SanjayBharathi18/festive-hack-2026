import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeskSlip } from "../../shared/orders.ts";
import {
  connectLive,
  parseSlip,
  retryMs,
  shownStatus,
  type LiveSource,
} from "./live.ts";
import { fakeSlip } from "./test-slips.ts";

type FakeSource = LiveSource & {
  url: string;
  closed: boolean;
  fire(type: string, data?: unknown): void;
  setState(state: number): void;
};

function setup({ onLine = true }: { onLine?: boolean } = {}) {
  const sources: FakeSource[] = [];
  const slips: DeskSlip[] = [];
  const statuses: string[] = [];
  const removed: string[] = [];
  const quotes: string[] = [];
  let gaps = 0;
  const controller = new AbortController();
  const networkEvents = new EventTarget();
  const network = {
    onLine,
    addEventListener: (type: "online" | "offline", listener: () => void) =>
      networkEvents.addEventListener(type, listener),
  };
  const goOnline = (next: boolean) => {
    network.onLine = next;
    networkEvents.dispatchEvent(new Event(next ? "online" : "offline"));
  };
  const live = connectLive({
    url: "/api/desk/events?demo=token",
    network,
    onRemoved: (id) => removed.push(id),
    onQuote: (id) => quotes.push(id),
    open: (url) => {
      const listeners = new Map<
        string,
        ((event: { data?: unknown }) => void)[]
      >();
      let state = 0;
      const source: FakeSource = {
        url,
        closed: false,
        get readyState() {
          return state;
        },
        addEventListener(type, listener) {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        close() {
          source.closed = true;
          state = 2;
        },
        fire(type, data) {
          if (type === "open") state = 1;
          for (const listener of listeners.get(type) ?? []) listener({ data });
        },
        setState(next) {
          state = next;
        },
      };
      sources.push(source);
      return source;
    },
    onSlip: (slip) => slips.push(slip),
    onStatus: (status) => statuses.push(status),
    onGap: () => gaps++,
    signal: controller.signal,
  });
  return {
    live,
    sources,
    slips,
    statuses,
    removed,
    quotes,
    goOnline,
    gaps: () => gaps,
    controller,
  };
}

test("a new order from the server reaches the board", () => {
  const { sources, slips, statuses } = setup();
  const source = sources[0];
  assert.equal(source?.url, "/api/desk/events?demo=token");
  source?.fire("open");
  const slip = fakeSlip({ number: 18 });
  source?.fire("order_created", JSON.stringify(slip));
  source?.fire("order_changed", JSON.stringify({ ...slip, status: "making" }));
  assert.deepEqual(
    slips.map((each) => [each.number, each.status]),
    [
      [18, "new"],
      [18, "making"],
    ],
  );
  assert.deepEqual(statuses, ["live"]);
});

test("an event that does not match the schema is dropped, and the board loads again", () => {
  const { sources, slips, gaps } = setup();
  const source = sources[0];
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    source?.fire("order_created", JSON.stringify({ id: "not a slip" }));
    source?.fire("order_created", "{not json");
  } finally {
    console.error = original;
  }
  assert.equal(slips.length, 0);
  assert.equal(gaps(), 2);
  assert.equal(errors.length, 2);
});

test("after a dropped line, the browser reconnects and the board loads again", () => {
  const { sources, statuses, gaps } = setup();
  const source = sources[0];
  source?.fire("open");
  source?.setState(0);
  source?.fire("error");
  assert.equal(gaps(), 0);
  source?.fire("open");
  assert.equal(gaps(), 1);
  assert.deepEqual(statuses, ["live", "connecting", "live"]);
  assert.equal(sources.length, 1);
});

test("a refused connection is tried again after a growing pause", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { sources, statuses, gaps } = setup();
  sources[0]?.setState(2);
  sources[0]?.fire("error");
  assert.deepEqual(statuses, ["offline"]);
  assert.equal(sources[0]?.closed, true);
  t.mock.timers.tick(retryMs[0]);
  assert.equal(sources.length, 2);
  sources[1]?.setState(2);
  sources[1]?.fire("error");
  t.mock.timers.tick(retryMs[0]);
  assert.equal(sources.length, 2);
  t.mock.timers.tick(retryMs[1] - retryMs[0]);
  assert.equal(sources.length, 3);
  sources[2]?.fire("open");
  assert.equal(gaps(), 1);
  assert.deepEqual(statuses, ["offline", "live"]);
});

test("wake connects at once when the line is down", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { live, sources } = setup();
  live.wake();
  assert.equal(sources.length, 1, "a working line stays");
  sources[0]?.setState(2);
  sources[0]?.fire("error");
  live.wake();
  assert.equal(sources.length, 2);
});

test("leaving the page closes the line and stops the retries", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { sources, controller } = setup();
  sources[0]?.setState(2);
  sources[0]?.fire("error");
  controller.abort();
  t.mock.timers.tick(retryMs.at(-1) ?? 0);
  assert.equal(sources.length, 1);
});

test("with no network the status says offline at once, and the network coming back opens a fresh line", () => {
  const { live, sources, statuses, goOnline, gaps } = setup();
  sources[0]?.fire("open");
  assert.equal(live.status, "live");
  goOnline(false);
  assert.equal(live.status, "offline");
  assert.deepEqual(statuses, ["live", "offline"]);
  goOnline(true);
  assert.equal(sources[0]?.closed, true);
  assert.equal(sources.length, 2);
  assert.equal(live.status, "connecting");
  sources[1]?.fire("open");
  assert.equal(live.status, "live");
  assert.equal(gaps(), 1);
  assert.deepEqual(statuses, ["live", "offline", "connecting", "live"]);
});

test("a desk that opens offline says so before the line answers", () => {
  const { live, sources, statuses } = setup({ onLine: false });
  assert.equal(live.status, "offline");
  sources[0]?.fire("open");
  assert.equal(live.status, "offline");
  assert.deepEqual(statuses, []);
});

test("the shown status is offline whenever the browser has no network", () => {
  assert.equal(shownStatus("live", false), "offline");
  assert.equal(shownStatus("connecting", false), "offline");
  assert.equal(shownStatus("live", true), "live");
  assert.equal(shownStatus("offline", true), "offline");
});

test("an order taken back and a new quote request arrive by id", () => {
  const { sources, removed, quotes, gaps } = setup();
  const source = sources[0];
  const id = "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60";
  source?.fire("order_removed", JSON.stringify({ id }));
  source?.fire("quote_created", JSON.stringify({ id }));
  assert.deepEqual(removed, [id]);
  assert.deepEqual(quotes, [id]);
  const original = console.error;
  console.error = () => {};
  try {
    source?.fire("quote_created", "{}");
  } finally {
    console.error = original;
  }
  assert.equal(gaps(), 1);
});

test("parseSlip reads one slip or nothing", () => {
  const slip = fakeSlip();
  assert.equal(parseSlip(JSON.stringify(slip))?.id, slip.id);
  assert.equal(parseSlip(undefined), undefined);
  assert.equal(parseSlip("[]"), undefined);
});
