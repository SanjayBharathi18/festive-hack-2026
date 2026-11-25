import assert from "node:assert/strict";
import { test } from "node:test";
import { orderStatusSchema } from "../../shared/model.ts";
import {
  payOffer,
  messageTime,
  statusLine,
  statusStamp,
  tiltOf,
} from "./order-status.ts";

test("work still to do is kumkum; finished work is leaf", () => {
  const kinds = Object.fromEntries(
    orderStatusSchema.options.map((status) => [
      status,
      statusStamp(status).kind,
    ]),
  );
  assert.deepEqual(kinds, {
    awaiting_payment: "need",
    new: "need",
    making: "need",
    ready: "done",
    delivered: "done",
    picked_up: "done",
    cancelled: "need",
    expired: "need",
  });
});

test("her stamps tilt; the system's stamps stay straight", () => {
  assert.equal(statusStamp("new").hand, false);
  assert.equal(statusStamp("expired").hand, false);
  assert.equal(statusStamp("making").hand, true);
  assert.equal(statusStamp("ready").hand, true);
  assert.equal(statusStamp("cancelled").hand, true);
});

test("ready says pickup or delivery", () => {
  assert.equal(statusLine("ready", "pickup"), "ready_pickup");
  assert.equal(statusLine("ready", "delivery"), "ready_delivery");
  assert.equal(statusLine("making", "delivery"), "making");
});

test("each order keeps one tilt", () => {
  assert.equal(tiltOf(12), "-3deg");
  assert.equal(tiltOf(13), "3deg");
  assert.equal(tiltOf(13), tiltOf(13));
});

test("a message shows its time today, and its date on an earlier day", () => {
  const at = Date.parse("2026-11-24T05:12:00Z");
  assert.equal(
    messageTime(at, "2026-11-24", "en").replace(/\s/g, " "),
    "10:42 am",
  );
  assert.match(messageTime(at, "2026-11-25", "en"), /^24 Nov, 10:42/);
  assert.match(messageTime(at, "2026-11-24", "mr"), /10:42/);
});

test("Pay online shows for an open unpaid order of a store that takes online payments", () => {
  const online = { online: true, refunded: false, pay_by: null };
  assert.equal(
    payOffer({ status: "new", paid: false, payment: online }),
    "optional",
  );
  assert.equal(
    payOffer({ status: "delivered", paid: false, payment: online }),
    "optional",
  );
  assert.equal(
    payOffer({
      status: "awaiting_payment",
      paid: false,
      payment: { ...online, pay_by: 1 },
    }),
    "required",
  );
  assert.equal(
    payOffer({ status: "new", paid: true, payment: online }),
    "none",
  );
  assert.equal(
    payOffer({ status: "cancelled", paid: false, payment: online }),
    "none",
  );
  assert.equal(
    payOffer({ status: "expired", paid: false, payment: online }),
    "none",
  );
  assert.equal(
    payOffer({
      status: "new",
      paid: false,
      payment: { ...online, online: false },
    }),
    "none",
  );
});
