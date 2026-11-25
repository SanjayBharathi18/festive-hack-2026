import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelReasonSchema,
  checkoutAnswerSchema,
  checkoutBodySchema,
  dailyListSchema,
  dayWarningSchema,
  deskBoardSchema,
  deskOrderAnswerSchema,
  deskOrderBodySchema,
  deskOrderPatchSchema,
  deskRangeSchema,
  deskSlipSchema,
  orderPageSchema,
  stampSchema,
  type DeskSlip,
  type OrderPage,
} from "./orders.ts";

const pack = "4c9a7e1e-8f0b-4d2a-9b3c-5d6e7f8a9b0c";
const store = "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60";
const orderId = "7f9c2ba4-e88f-4f2b-9d2a-1c4b5d6e7f80";

const checkout = {
  store_id: store,
  proof: "p".repeat(43),
  day: "2026-11-28",
  fulfilment: "pickup",
  buyer_name: " Priya ",
  cart: [{ pack_id: pack, quantity: 2, price: 45000 }],
};

const line = {
  item_id: "item",
  pack_id: pack,
  name: "Mysore pak",
  label: "500 g",
  quantity: 2,
  price: 45000,
  grams: 500,
  pieces: null,
  veg_mark: "veg" as const,
  name_latin: "Mysore pak",
};

const page: OrderPage = {
  number: 1,
  status: "new",
  paid: false,
  payment_required: false,
  day: "2026-11-28",
  fulfilment: "pickup",
  total: 90000,
  lines: [{ ...line, name_script: null }],
  buyer_name: "Priya",
  address: null,
  gift: null,
  note: null,
  cancel_reason: null,
  created_at: 1,
  store: {
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    area: "Basavanagudi",
    is_demo: true,
    message_url: "https://wa.me/919800000001?text=Hello",
    pickup: { address: "12, 4th Cross", map_url: null },
  },
  messages: [
    {
      template: "order_placed",
      language: "kn",
      body: "…",
      channel: "simulated",
      created_at: 1,
    },
  ],
  payment: { online: true, refunded: false, pay_by: null },
};

const slip: DeskSlip = {
  id: orderId,
  number: 1,
  token: "abcdefghijklmnopqrstuvwx",
  order_url: "https://34-12-56-78.sslip.io/o/abcdefghijklmnopqrstuvwx",
  share_url: null,
  status: "new",
  next_stamp: "making",
  paid: false,
  refunded: false,
  refund: null,
  payment_required: false,
  source: "link",
  fulfilment: "pickup",
  day: "2026-11-28",
  total: 90000,
  lines: [line],
  buyer_name: "Priya",
  buyer_phone: "+919876543210",
  buyer_language: "kn",
  address: null,
  gift: null,
  note: null,
  note_translation: null,
  cancel_reason: null,
  reading: { language: "kn-IN", variant: "native", edited: false },
  messages: [],
  created_at: 1,
};

test("a checkout body is trimmed, and its empty fields become null", () => {
  const body = checkoutBodySchema.parse({
    ...checkout,
    note: "  ",
    via: "market",
  });
  assert.equal(body.buyer_name, "Priya");
  assert.equal(body.note, null);
  assert.equal(body.address, null);
  assert.equal(body.gift, null);
  assert.equal(body.buyer_language, "en");
  assert.equal(
    checkoutBodySchema.safeParse({ ...checkout, cart: [] }).success,
    false,
  );
});

test("a checkout body needs an address for delivery, and a gift only with delivery", () => {
  assert.equal(
    checkoutBodySchema.safeParse({ ...checkout, fulfilment: "delivery" })
      .success,
    false,
  );
  assert.equal(
    checkoutBodySchema.safeParse({ ...checkout, gift: { name: "Amma" } })
      .success,
    false,
  );
  const gift = checkoutBodySchema.parse({
    ...checkout,
    fulfilment: "delivery",
    address: "Jayanagar",
    gift: { name: "Amma", phone: "98450 12345" },
  }).gift;
  assert.deepEqual(gift, {
    name: "Amma",
    phone: "+919845012345",
    message: null,
  });
});

test("a cart lists each pack once", () => {
  const twice = [checkout.cart[0], { ...checkout.cart[0], quantity: 1 }];
  assert.equal(
    checkoutBodySchema.safeParse({ ...checkout, cart: twice }).success,
    false,
  );
});

test("a desk order body takes an optional reading and buyer number", () => {
  const body = deskOrderBodySchema.parse({
    day: "2026-11-28",
    fulfilment: "delivery",
    cart: [{ pack_id: pack, quantity: 1 }],
    buyer_phone: "98450 12345",
    reading: {
      order_id: orderId,
      transcript: "ಒಂದು ಕೆಜಿ",
      language: "kn-IN",
      variant: null,
      edited: true,
    },
  });
  assert.equal(body.source, "desk");
  assert.equal(body.buyer_phone, "+919845012345");
  assert.equal(body.address, null);
  assert.equal(body.reading?.order_id, orderId);
  assert.equal(
    deskOrderBodySchema.safeParse({ ...body, reading: { order_id: orderId } })
      .success,
    false,
  );
});

test("a desk patch is a stamp, paid, a cancel with a reason, or an edit", () => {
  for (const patch of [
    { action: "stamp", status: "ready" },
    { action: "paid", paid: true },
    { action: "cancel", reason: "cant_deliver" },
    {
      action: "edit",
      day: "2026-11-29",
      fulfilment: "pickup",
      cart: [{ pack_id: pack, quantity: 1 }],
    },
  ]) {
    assert.equal(
      deskOrderPatchSchema.safeParse(patch).success,
      true,
      patch.action,
    );
  }
  for (const patch of [
    { action: "stamp", status: "cancelled" },
    { action: "cancel" },
    { action: "cancel", reason: "changed my mind" },
    { action: "edit", day: "2026-11-29" },
  ]) {
    assert.equal(deskOrderPatchSchema.safeParse(patch).success, false);
  }
});

test("the four cancel reasons and the five stamps", () => {
  assert.deepEqual(cancelReasonSchema.options, [
    "cant_deliver",
    "item_ran_out",
    "day_full",
    "other",
  ]);
  assert.deepEqual(stampSchema.options, [
    "new",
    "making",
    "ready",
    "delivered",
    "picked_up",
  ]);
});

test("a desk range runs from a day to a later day", () => {
  assert.deepEqual(deskRangeSchema.parse({ from: "2026-11-24" }), {
    from: "2026-11-24",
  });
  assert.equal(
    deskRangeSchema.safeParse({ from: "2026-11-25", to: "2026-11-24" }).success,
    false,
  );
});

test("an order page and a checkout answer", () => {
  assert.deepEqual(orderPageSchema.parse(page), page);
  assert.deepEqual(
    checkoutAnswerSchema.parse({ token: slip.token, order: page }).order,
    page,
  );
  assert.equal(
    orderPageSchema.safeParse({ ...page, status: "paid" }).success,
    false,
  );
  assert.equal(
    orderPageSchema.safeParse({
      ...page,
      payment: { online: true, refunded: false },
    }).success,
    false,
  );
});

test("a desk slip, a warning and a desk answer", () => {
  const warning = {
    day: "2026-11-28",
    reason: "full",
    space_left: 0,
    next_free_day: "2026-11-29",
  };
  assert.deepEqual(deskSlipSchema.parse(slip), slip);
  assert.deepEqual(dayWarningSchema.parse(warning), warning);
  assert.deepEqual(
    deskOrderAnswerSchema.parse({ order: slip, warning }).warning,
    warning,
  );
  assert.equal(
    deskSlipSchema.safeParse({ ...slip, next_stamp: "paid" }).success,
    false,
  );
  assert.equal(
    dayWarningSchema.safeParse({ ...warning, reason: "busy" }).success,
    false,
  );
});

test("a board and a daily list", () => {
  const board = {
    today: "2026-11-24",
    limit_unit: "kg",
    daily_limit: 25000,
    days: [{ day: "2026-11-28", load: 1000, space_left: 24000, slips: [slip] }],
  };
  assert.deepEqual(deskBoardSchema.parse(board), board);
  assert.equal(
    deskBoardSchema.safeParse({ ...board, daily_limit: 0 }).success,
    false,
  );
  const money = { value: 90000, paid: 0, owed: 90000 };
  const daily = {
    today: "2026-11-24",
    limit_unit: "kg",
    daily_limit: 25000,
    days: [
      {
        day: "2026-11-28",
        load: 1000,
        space_left: 24000,
        closed: false,
        orders: 1,
        items: [
          {
            item_id: "item",
            name: "Mysore pak",
            grams: 1000,
            pieces: null,
            packs: [{ label: "500 g", quantity: 2 }],
          },
        ],
        ...money,
      },
    ],
    last_30_days: { from: "2026-10-26", to: "2026-11-24", orders: 1, ...money },
  };
  assert.deepEqual(dailyListSchema.parse(daily), daily);
  assert.equal(
    dailyListSchema.safeParse({ ...daily, last_30_days: { orders: -1 } })
      .success,
    false,
  );
});
