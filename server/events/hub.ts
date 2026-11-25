import type { DeskSlip } from "../../shared/orders.ts";

// A new or changed order carries its slip. A desk order that she took back
// with Undo carries its id, and a new quote request its id: the desk then
// asks for its list of requests, in her language.
export type DeskEvent =
  | { type: "order_created" | "order_changed"; order: DeskSlip }
  | { type: "order_removed"; order_id: string }
  | { type: "quote_created"; quote_id: string };

export type Listener = (event: DeskEvent) => void;

export type EventHub = {
  publish: (storeId: string, event: DeskEvent) => void;
  subscribe: (storeId: string, listener: Listener) => () => void;
  listeners: (storeId: string) => number;
};

export function createEventHub(
  onListenerError: (error: unknown) => void = () => {},
): EventHub {
  const stores = new Map<string, Set<Listener>>();
  return {
    publish: (storeId, event) => {
      for (const listener of stores.get(storeId) ?? []) {
        try {
          listener(event);
        } catch (error) {
          onListenerError(error);
        }
      }
    },
    subscribe: (storeId, listener) => {
      const listeners = stores.get(storeId) ?? new Set();
      listeners.add(listener);
      stores.set(storeId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stores.delete(storeId);
      };
    },
    listeners: (storeId) => stores.get(storeId)?.size ?? 0,
  };
}
