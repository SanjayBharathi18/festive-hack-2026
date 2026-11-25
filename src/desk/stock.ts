import type { Day } from "../../shared/day.ts";
import {
  closedDayAnswerSchema,
  pausedSchema,
  soldOutAnswerSchema,
  type DeskStore,
} from "../../shared/desk.ts";
import type { Api } from "../api/api.ts";

export type StockChange =
  | { kind: "sold_out"; itemId: string }
  | { kind: "paused" }
  | { kind: "closed"; day: Day };

export type StockFailure = { change: StockChange; error: unknown };

// The tiffin latch of each stop: an item or a day closes and opens; the
// whole store pauses and resumes.
export type StockSounds = {
  avail(change: "open" | "close" | "pause" | "resume"): void;
};

export type Stock = {
  paused(): boolean;
  isSoldOut(itemId: string): boolean;
  isClosed(day: Day): boolean;
  closedDays(): Day[];
  pause(on: boolean): void;
  sellOut(itemId: string, on: boolean): void;
  close(day: Day, on: boolean): void;
  failure(): StockFailure | undefined;
  subscribe(listener: () => void): () => void;
};

type Switch = {
  change: StockChange;
  confirmed: boolean;
  wanted: boolean;
  pending: number;
  chain: Promise<unknown>;
};

// Her three stops: an item that ran out, the whole store, one day. Each touch
// shows at once and goes to the server in order; the last touch wins. When
// the server cannot take a change, the switch goes back to what the server
// has, and the failure says what to do.
export function createStock({
  api,
  desk,
  sounds,
}: {
  api: Pick<Api, "send">;
  desk: Pick<DeskStore, "store" | "menu" | "closed_dates">;
  sounds?: StockSounds;
}): Stock {
  const switches = new Map<string, Switch>();
  const listeners = new Set<() => void>();
  let failure: StockFailure | undefined;

  const emit = () => {
    for (const listener of listeners) listener();
  };
  const make = (change: StockChange, value: boolean): Switch => ({
    change,
    confirmed: value,
    wanted: value,
    pending: 0,
    chain: Promise.resolve(),
  });
  const pausedSwitch = make({ kind: "paused" }, desk.store.paused);
  switches.set(keyOf(pausedSwitch.change), pausedSwitch);
  for (const item of desk.menu) {
    const each = make({ kind: "sold_out", itemId: item.id }, item.sold_out);
    switches.set(keyOf(each.change), each);
  }
  for (const day of desk.closed_dates) {
    const each = make({ kind: "closed", day }, true);
    switches.set(keyOf(each.change), each);
  }

  const switchOf = (change: StockChange): Switch => {
    const key = keyOf(change);
    let found = switches.get(key);
    if (found === undefined) {
      found = make(change, false);
      switches.set(key, found);
    }
    return found;
  };
  const wanted = (change: StockChange) =>
    switches.get(keyOf(change))?.wanted ?? false;

  const set = (change: StockChange, on: boolean) => {
    const target = switchOf(change);
    if (target.wanted === on && target.pending === 0) return;
    if (failure !== undefined && sameChange(failure.change, change)) {
      failure = undefined;
    }
    target.wanted = on;
    target.pending += 1;
    sounds?.avail(
      change.kind === "paused"
        ? on
          ? "pause"
          : "resume"
        : on
          ? "close"
          : "open",
    );
    const run = async () => {
      try {
        target.confirmed = await send(api, change, on);
        if (failure !== undefined && sameChange(failure.change, change)) {
          failure = undefined;
        }
      } catch (error) {
        failure = { change, error };
      } finally {
        target.pending -= 1;
        if (target.pending === 0) target.wanted = target.confirmed;
        emit();
      }
    };
    target.chain = target.chain.then(run);
    emit();
  };

  return {
    paused: () => wanted({ kind: "paused" }),
    isSoldOut: (itemId) => wanted({ kind: "sold_out", itemId }),
    isClosed: (day) => wanted({ kind: "closed", day }),
    closedDays: () =>
      [...switches.values()]
        .flatMap(({ change, wanted: on }) =>
          change.kind === "closed" && on ? [change.day] : [],
        )
        .sort(),
    pause: (on) => set({ kind: "paused" }, on),
    sellOut: (itemId, on) => set({ kind: "sold_out", itemId }, on),
    close: (day, on) => set({ kind: "closed", day }, on),
    failure: () => failure,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Each change sets a state, so it goes with keepalive: a touch just before
// she closes the desk still arrives.
async function send(
  api: Pick<Api, "send">,
  change: StockChange,
  on: boolean,
): Promise<boolean> {
  const options = { keepalive: true };
  switch (change.kind) {
    case "sold_out":
      return (
        await api.send(
          "PUT",
          `/api/desk/items/${encodeURIComponent(change.itemId)}/sold-out`,
          { sold_out: on },
          soldOutAnswerSchema,
          options,
        )
      ).sold_out;
    case "paused":
      return (
        await api.send(
          "PUT",
          "/api/desk/paused",
          { paused: on },
          pausedSchema,
          options,
        )
      ).paused;
    case "closed":
      return (
        await api.send(
          "PUT",
          `/api/desk/closed-dates/${change.day}`,
          { closed: on },
          closedDayAnswerSchema,
          options,
        )
      ).closed;
  }
}

export function sameChange(a: StockChange, b: StockChange): boolean {
  return keyOf(a) === keyOf(b);
}

function keyOf(change: StockChange): string {
  switch (change.kind) {
    case "sold_out":
      return `sold_out:${change.itemId}`;
    case "paused":
      return "paused";
    case "closed":
      return `closed:${change.day}`;
  }
}
