import {
  undoWindowMs,
  type CancelReason,
  type DeskOrderAnswer,
  type DeskOrderPatch,
  type DeskSlip,
  type Stamp,
} from "../../shared/orders.ts";
import { isApiError } from "../api/api.ts";
import { isOpen, isStamp, nextStamp } from "./stamps.ts";

export type SendPatch = (
  id: string,
  patch: DeskOrderPatch,
  options?: { keepalive?: boolean },
) => Promise<DeskOrderAnswer>;

export type SendRefund = (
  id: string,
  options?: { keepalive?: boolean },
) => Promise<DeskOrderAnswer>;

export type Slips = {
  get(id: string): DeskSlip | undefined;
  put(slip: DeskSlip): void;
};

// The sounds of her hand on the slips, and of the news that comes live.
export type SlipSounds = {
  tick(): void;
  stamp(status: Stamp | "paid"): void;
  undo(): void;
  cancel(): void;
  commit(): void;
  settle(): void;
  error(): void;
  arrival(): void;
};

const quiet: SlipSounds = {
  tick: () => {},
  stamp: () => {},
  undo: () => {},
  cancel: () => {},
  commit: () => {},
  settle: () => {},
  error: () => {},
  arrival: () => {},
};

export type SlipUi = {
  undoSeconds: number | undefined;
  cancelling: { reason: CancelReason; seconds: number } | undefined;
  refunding: { seconds: number } | undefined;
  refunded: Refunded | undefined;
  error: unknown;
  handPaid: boolean;
};

export type SlipActions = {
  stamp(id: string): void;
  markPaid(id: string): void;
  undo(id: string): void;
  cancel(id: string, reason: CancelReason): void;
  refund(id: string, online: boolean): void;
  keep(id: string): void;
  edit(
    id: string,
    patch: Extract<DeskOrderPatch, { action: "edit" }>,
  ): Promise<DeskOrderAnswer>;
  accept(slip: DeskSlip): void;
  flush(): void;
  ui(id: string): SlipUi;
  takeLanding(id: string): "status" | "paid" | undefined;
  subscribe(listener: (id: string) => void): () => void;
};

export type Refunded = { online: boolean; amount: number };
type EditPatch = Extract<DeskOrderPatch, { action: "edit" }>;

type Last =
  | { id: string; kind: "stamp"; from: Stamp; until: number }
  | { id: string; kind: "paid"; until: number }
  | { id: string; kind: "edit"; before: DeskSlip; until: number };
type Hold = (
  { kind: "cancel"; reason: CancelReason } | { kind: "refund"; online: boolean }
) & { until: number; timer: ReturnType<typeof setTimeout> };

// The server sends the READY message only when an order is still READY after
// its undo window, so undo and the cancel hold use the same window.
export const undoMs = undoWindowMs;
export const holdMs = undoWindowMs;

const staleCodes = new Set(["stamp_not_allowed", "order_closed", "not_found"]);

// Her hand on the slips: each stamp shows at once and goes to the server in
// order, one order at a time; a tap while a stamp of the order is on its way
// does nothing, so that one tap is one step. Undo is one step back for 10 s,
// also for a change of the order. A cancel waits 10 s before it is sent,
// because a cancel is final on the server. A refund waits in the same way:
// its tap ticks, and the commit plays on the server's reply.
export function createSlipActions({
  slips,
  send,
  sendRefund,
  onStale = () => {},
  now = Date.now,
  sounds = quiet,
}: {
  slips: Slips;
  send: SendPatch;
  sendRefund: SendRefund;
  onStale?: () => void;
  now?: () => number;
  sounds?: SlipSounds;
}): SlipActions {
  const listeners = new Set<(id: string) => void>();
  const pending = new Map<string, number>();
  const confirmed = new Map<string, DeskSlip>();
  const chains = new Map<string, Promise<unknown>>();
  const epochs = new Map<string, number>();
  const holds = new Map<string, Hold>();
  const errors = new Map<string, unknown>();
  const handPaid = new Set<string>();
  const refunded = new Map<string, Refunded>();
  const stamping = new Map<string, number>();
  const landings = new Map<string, "status" | "paid">();
  let last: Last | undefined;
  let lastTimer: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const emit = (id: string) => {
    for (const listener of listeners) listener(id);
  };

  const tick = () => {
    const ids = [...holds.keys(), ...(last === undefined ? [] : [last.id])];
    if (ids.length === 0) {
      clearInterval(ticker);
      ticker = undefined;
      return;
    }
    for (const id of new Set(ids)) emit(id);
  };
  const startTicker = () => {
    ticker ??= setInterval(tick, 1000);
  };

  const remember = (next: Last | undefined) => {
    const before = last?.id;
    clearTimeout(lastTimer);
    last = next;
    if (next !== undefined) {
      lastTimer = setTimeout(() => {
        if (last !== next) return;
        last = undefined;
        emit(next.id);
      }, next.until - now());
      startTicker();
    }
    if (before !== undefined && before !== next?.id) emit(before);
  };

  const change = (slip: DeskSlip, patch: Partial<DeskSlip>) => {
    if ((pending.get(slip.id) ?? 0) === 0) confirmed.set(slip.id, slip);
    errors.delete(slip.id);
    slips.put({ ...slip, ...patch });
  };

  const queue = (
    id: string,
    call: () => Promise<DeskOrderAnswer>,
    { showError = true }: { showError?: boolean } = {},
  ): Promise<DeskOrderAnswer> => {
    const epoch = epochs.get(id) ?? 0;
    pending.set(id, (pending.get(id) ?? 0) + 1);
    const run = async (): Promise<DeskOrderAnswer> => {
      try {
        if ((epochs.get(id) ?? 0) !== epoch) {
          throw new DOMException("An earlier change failed.", "AbortError");
        }
        const answer = await call();
        confirmed.set(id, answer.order);
        if ((pending.get(id) ?? 0) === 1) slips.put(answer.order);
        return answer;
      } catch (thrown) {
        const error = orderGone(thrown);
        if ((epochs.get(id) ?? 0) === epoch) {
          epochs.set(id, epoch + 1);
          if (showError) {
            errors.set(id, error);
            sounds.error();
          }
          if (last?.id === id) remember(undefined);
          const known = confirmed.get(id);
          if (known !== undefined) slips.put(known);
          if (isApiError(thrown) && staleCodes.has(thrown.code)) onStale();
        }
        throw error;
      } finally {
        const left = (pending.get(id) ?? 1) - 1;
        if (left === 0) pending.delete(id);
        else pending.set(id, left);
        emit(id);
      }
    };
    const chain = (chains.get(id) ?? Promise.resolve()).then(run, run);
    chains.set(
      id,
      chain.catch(() => undefined),
    );
    return chain;
  };

  const quietly = (work: Promise<unknown>) => void work.catch(() => undefined);

  const sendStamp = (id: string, status: Stamp) => {
    stamping.set(id, (stamping.get(id) ?? 0) + 1);
    const sent = queue(id, () => send(id, { action: "stamp", status }));
    quietly(
      sent.finally(() => {
        const left = (stamping.get(id) ?? 1) - 1;
        if (left === 0) stamping.delete(id);
        else stamping.set(id, left);
      }),
    );
  };

  const sendHeld = (id: string, keepalive: boolean) => {
    const hold = holds.get(id);
    if (hold === undefined) return;
    clearTimeout(hold.timer);
    holds.delete(id);
    const slip = slips.get(id);
    if (slip === undefined) return;
    if (hold.kind === "refund") {
      change(slip, { paid: false });
      handPaid.delete(id);
      refunded.set(id, { online: hold.online, amount: slip.total });
      if (keepalive) {
        quietly(sendRefund(id, { keepalive: true }));
        return;
      }
      void queue(id, () => sendRefund(id)).then(
        () => sounds.commit(),
        () => {
          refunded.delete(id);
          emit(id);
        },
      );
      return;
    }
    const patch: DeskOrderPatch = { action: "cancel", reason: hold.reason };
    change(slip, {
      status: "cancelled",
      cancel_reason: hold.reason,
      next_stamp: null,
    });
    if (keepalive) {
      quietly(send(id, patch, { keepalive: true }));
      return;
    }
    quietly(queue(id, () => send(id, patch)));
  };

  return {
    stamp(id) {
      const slip = slips.get(id);
      const target = slip?.next_stamp;
      if (slip === undefined || !target || holds.has(id)) return;
      if (!isStamp(slip.status) || stamping.has(id)) return;
      landings.set(id, "status");
      sounds.stamp(target);
      remember({ id, kind: "stamp", from: slip.status, until: now() + undoMs });
      change(slip, {
        status: target,
        next_stamp: nextStamp(target, slip.fulfilment),
      });
      sendStamp(id, target);
      emit(id);
    },
    markPaid(id) {
      const slip = slips.get(id);
      if (slip === undefined || slip.paid || holds.has(id)) return;
      handPaid.add(id);
      refunded.delete(id);
      landings.set(id, "paid");
      sounds.stamp("paid");
      remember({ id, kind: "paid", until: now() + undoMs });
      change(slip, { paid: true });
      quietly(queue(id, () => send(id, { action: "paid", paid: true })));
      emit(id);
    },
    undo(id) {
      const step = last;
      const slip = slips.get(id);
      if (step?.id !== id || slip === undefined) return;
      remember(undefined);
      landings.delete(id);
      sounds.undo();
      if (step.kind === "stamp") {
        change(slip, {
          status: step.from,
          next_stamp: nextStamp(step.from, slip.fulfilment),
        });
        sendStamp(id, step.from);
      } else if (step.kind === "edit") {
        const patch = editPatchOf(step.before);
        change(slip, editedFields(step.before));
        quietly(queue(id, () => send(id, patch)));
      } else {
        change(slip, { paid: false });
        handPaid.delete(id);
        quietly(queue(id, () => send(id, { action: "paid", paid: false })));
      }
      emit(id);
    },
    cancel(id, reason) {
      const slip = slips.get(id);
      if (slip === undefined || !isOpen(slip.status) || holds.has(id)) return;
      if (last?.id === id) remember(undefined);
      errors.delete(id);
      sounds.cancel();
      holds.set(id, {
        kind: "cancel",
        reason,
        until: now() + holdMs,
        timer: setTimeout(() => sendHeld(id, false), holdMs),
      });
      startTicker();
      emit(id);
    },
    refund(id, online) {
      const slip = slips.get(id);
      if (slip === undefined || !slip.paid || holds.has(id)) return;
      if (last?.id === id) remember(undefined);
      errors.delete(id);
      sounds.tick();
      holds.set(id, {
        kind: "refund",
        online,
        until: now() + holdMs,
        timer: setTimeout(() => sendHeld(id, false), holdMs),
      });
      startTicker();
      emit(id);
    },
    keep(id) {
      const hold = holds.get(id);
      if (hold === undefined) return;
      clearTimeout(hold.timer);
      holds.delete(id);
      sounds.undo();
      emit(id);
    },
    async edit(id, patch) {
      const before = slips.get(id);
      const answer = await queue(id, () => send(id, patch), {
        showError: false,
      });
      if (before !== undefined && editPatchOf(before).cart.length > 0) {
        remember({ id, kind: "edit", before, until: now() + undoMs });
        emit(id);
      }
      return answer;
    },
    accept(slip) {
      const before = slips.get(slip.id);
      // A new order from a buyer rings; an order that she typed at the desk
      // is hers already. An online payment that arrives settles.
      if (before === undefined && slip.source !== "desk") sounds.arrival();
      else if (before?.paid === false && slip.paid && !handPaid.has(slip.id)) {
        sounds.settle();
      }
      if ((pending.get(slip.id) ?? 0) > 0) {
        confirmed.set(slip.id, slip);
        return;
      }
      slips.put(slip);
    },
    flush() {
      for (const id of [...holds.keys()]) sendHeld(id, true);
    },
    ui(id) {
      const hold = holds.get(id);
      return {
        undoSeconds:
          last?.id === id ? secondsUntil(last.until, now()) : undefined,
        cancelling:
          hold?.kind === "cancel"
            ? { reason: hold.reason, seconds: secondsUntil(hold.until, now()) }
            : undefined,
        refunding:
          hold?.kind === "refund"
            ? { seconds: secondsUntil(hold.until, now()) }
            : undefined,
        refunded: refundedOf(slips.get(id), refunded.get(id)),
        error: errors.get(id),
        handPaid: handPaid.has(id),
      };
    },
    takeLanding(id) {
      const landing = landings.get(id);
      landings.delete(id);
      return landing;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function secondsUntil(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

// A refund she made here shows how it went; after a reload, the order says
// what its last refund gave back, in cash or online.
function refundedOf(
  slip: DeskSlip | undefined,
  made: Refunded | undefined,
): Refunded | undefined {
  if (slip === undefined || slip.paid) return undefined;
  if (made !== undefined) return made;
  if (slip.refund !== null) return slip.refund;
  return slip.refunded ? { online: true, amount: slip.total } : undefined;
}

// Undo of a change saves the values that the order had before it.
export function editPatchOf(slip: DeskSlip): EditPatch {
  return {
    action: "edit",
    day: slip.day,
    fulfilment: slip.fulfilment,
    address: slip.address,
    note: slip.note,
    buyer_name: slip.buyer_name,
    buyer_phone: slip.buyer_phone,
    cart: slip.lines.flatMap(({ pack_id, quantity }) =>
      pack_id === null ? [] : [{ pack_id, quantity }],
    ),
  };
}

function editedFields(slip: DeskSlip): Partial<DeskSlip> {
  const { day, fulfilment, address, note, buyer_name, buyer_phone } = slip;
  return {
    day,
    fulfilment,
    address,
    note,
    buyer_name,
    buyer_phone,
    lines: slip.lines,
    total: slip.total,
  };
}

// Each call here goes to the route of one order, so its not_found means that
// the order is gone, not that the store is missing.
function orderGone(error: unknown): unknown {
  return isApiError(error) && error.code === "not_found"
    ? Object.assign(
        new Error("This order is not on the desk any more.", { cause: error }),
        { code: "order_gone" },
      )
    : error;
}
