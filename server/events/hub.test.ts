import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeskSlip } from "../../shared/orders.ts";
import { createEventHub, type DeskEvent } from "./hub.ts";

const event = (id: string): DeskEvent => ({
  type: "order_created",
  order: { id } as DeskSlip,
});
const idOf = (e: DeskEvent): string => ("order" in e ? e.order.id : "");

test("an event reaches each listener of its store, and no other store", () => {
  const hub = createEventHub();
  const first: string[] = [];
  const second: string[] = [];
  const other: string[] = [];
  hub.subscribe("store-a", (e) => first.push(idOf(e)));
  hub.subscribe("store-a", (e) => second.push(idOf(e)));
  hub.subscribe("store-b", (e) => other.push(idOf(e)));
  hub.publish("store-a", event("order-1"));
  assert.deepEqual(first, ["order-1"]);
  assert.deepEqual(second, ["order-1"]);
  assert.deepEqual(other, []);
});

test("a listener that unsubscribes gets no more events", () => {
  const hub = createEventHub();
  const seen: string[] = [];
  const unsubscribe = hub.subscribe("store-a", (e) => seen.push(idOf(e)));
  hub.publish("store-a", event("order-1"));
  unsubscribe();
  hub.publish("store-a", event("order-2"));
  assert.deepEqual(seen, ["order-1"]);
  assert.equal(hub.listeners("store-a"), 0);
});

test("a listener that throws does not stop the others", () => {
  const errors: unknown[] = [];
  const hub = createEventHub((error) => errors.push(error));
  const seen: string[] = [];
  hub.subscribe("store-a", () => {
    throw new Error("closed stream");
  });
  hub.subscribe("store-a", (e) => seen.push(idOf(e)));
  hub.publish("store-a", event("order-1"));
  assert.deepEqual(seen, ["order-1"]);
  assert.equal(errors.length, 1);
});
