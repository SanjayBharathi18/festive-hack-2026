import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  deskQuotesSchema,
  quoteAnswerSchema,
  type QuoteBody,
} from "../../shared/quotes.ts";
import { demoBoardToken } from "../demo/seed-bulk-catering.ts";
import { sseReader } from "../events/test-sse.ts";
import { getMenu } from "../stores/menu.ts";
import { postJson } from "../verify/test-sign-in.ts";
import {
  daawatPhone,
  daawatSlug,
  gharPhone,
  gharSlug,
  quoteApp,
} from "./test-quote-app.ts";

const silverPicks = [
  { category: "Sweets", dish: "Gulab jamun" },
  { category: "Mains", dish: "Bisi bele bath" },
  { category: "Mains", dish: "Veg kurma" },
  { category: "Breads", dish: "Poori" },
  { category: "Rice", dish: "Curd rice" },
];

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

function cateringRequest(
  shop: ReturnType<typeof quoteApp>,
  overrides: Record<string, unknown> = {},
  event: Record<string, unknown> = {},
) {
  return {
    kind: "catering" as const,
    store_id: shop.storeId(daawatSlug),
    package_id: shop.packageId("silver-plate"),
    dishes: silverPicks,
    event: {
      date: shop.seed.saturday,
      guests: 120,
      place: "Jayanagar 4th Block",
      service_style: "staff" as const,
      ...event,
    },
    note: null,
    ...overrides,
  };
}

async function ask(
  shop: ReturnType<typeof quoteApp>,
  request: QuoteBody["request"],
  key: string = randomUUID(),
) {
  const { proof, phone } = await shop.proof();
  const body: QuoteBody = {
    proof,
    buyer_name: "Meera Iyer",
    language: "en",
    request,
  };
  const response = await shop.post("/api/quotes", body, {
    "Idempotency-Key": key,
  });
  return { response, body, phone, key };
}

function kajuKatliId(shop: ReturnType<typeof quoteApp>): string {
  const row = shop.deps.db
    .prepare(
      "SELECT id FROM items WHERE store_id = ? AND in_bulk = 1 AND name = ?",
    )
    .pluck()
    .get(shop.storeId(gharSlug), "Kaju katli") as string | undefined;
  assert.ok(row);
  return row;
}

test("a catering plan becomes a quote request with her number for WhatsApp", async () => {
  const shop = quoteApp();
  const { response } = await ask(shop, cateringRequest(shop));
  assert.equal(response.status, 201, await response.clone().text());
  const answer = quoteAnswerSchema.parse(await response.json());
  assert.deepEqual(answer.store, { slug: daawatSlug, name: "Daawat Caterers" });
  assert.equal(answer.seller_phone, daawatPhone);
  assert.equal(answer.request.kind, "catering");
  if (answer.request.kind !== "catering") return;
  assert.equal(answer.request.package.name, "Silver plate");
  assert.equal(answer.request.estimate, (35_000 + 4_000) * 120);
  assert.deepEqual(answer.request.dishes, [
    { category: "Sweets", names: ["Gulab jamun"] },
    { category: "Mains", names: ["Bisi bele bath", "Veg kurma"] },
    { category: "Breads", names: ["Poori"] },
    { category: "Rice", names: ["Curd rice"] },
  ]);
  const metrics = await (await shop.app.request("/metrics")).text();
  assert.match(metrics, /quote_requests_total\{kind="catering"\} 1/);
});

test("the estimate adds what each service style adds to a plate, and the request keeps no food type", async () => {
  const shop = quoteApp();
  const expected = {
    delivery: [0, 35_000 * 120],
    staff: [4_000, 39_000 * 120],
    live_counters: [7_500, 42_500 * 120],
  } as const;
  for (const [style, [extra, estimate]] of Object.entries(expected)) {
    const { response } = await ask(
      shop,
      cateringRequest(shop, {}, { service_style: style, food_type: "veg" }),
    );
    assert.equal(response.status, 201, await response.clone().text());
    const answer = quoteAnswerSchema.parse(await response.json());
    assert.ok(answer.request.kind === "catering");
    assert.equal(answer.request.service_extra, extra, style);
    assert.equal(answer.request.estimate, estimate, style);
  }
  const stored = shop.deps.db
    .prepare("SELECT payload FROM quote_requests WHERE store_id = ?")
    .pluck()
    .all(shop.storeId(daawatSlug)) as string[];
  assert.equal(stored.length, 3);
  for (const payload of stored) {
    const { event } = JSON.parse(payload) as { event: object };
    assert.equal("food_type" in event, false, payload);
  }
});

test("a new quote request reaches the open desk of its store at once", async (t) => {
  const shop = quoteApp();
  const cookie = await shop.sellerCookie(daawatPhone);
  const events = sseReader(
    await shop.app.request("/api/desk/events", { headers: { Cookie: cookie } }),
  );
  t.after(() => events.cancel());
  assert.equal((await events.next())?.event, "heartbeat");
  const { response } = await ask(shop, cateringRequest(shop));
  assert.equal(response.status, 201, await response.clone().text());
  const answer = quoteAnswerSchema.parse(await response.json());
  const event = await events.nextOf("quote_created");
  assert.deepEqual(JSON.parse(event?.data ?? "{}"), { id: answer.id });
});

test("a retry with the same key gives the same request once, and the proof works once", async () => {
  const shop = quoteApp();
  const first = await ask(shop, cateringRequest(shop));
  assert.equal(first.response.status, 201);
  const again = await shop.post("/api/quotes", first.body, {
    "Idempotency-Key": first.key,
  });
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), await first.response.json());
  const reused = await shop.post("/api/quotes", first.body);
  assert.equal(reused.status, 401);
  assert.equal((await errorOf(reused)).code, "proof_invalid");
  assert.equal(
    shop.deps.db
      .prepare("SELECT count(*) FROM quote_requests WHERE store_id = ?")
      .pluck()
      .get(shop.storeId(daawatSlug)),
    1,
  );
});

test("a plan that breaks the plate rules, a booked date or too few guests is refused", async () => {
  const shop = quoteApp();
  const cases: [
    Record<string, unknown>,
    Record<string, unknown>,
    number,
    string,
  ][] = [
    [
      {
        dishes: [
          ...silverPicks,
          { category: "Sweets", dish: "Mysore pak" },
          { category: "Sweets", dish: "Payasam" },
        ],
      },
      {},
      400,
      "invalid_input",
    ],
    [{}, { date: shop.seed.sunday }, 409, "day_closed"],
    [{}, { date: "2026-11-01" }, 400, "day_past"],
    [{}, { guests: 60 }, 400, "invalid_input"],
    [{ package_id: randomUUID() }, {}, 404, "not_found"],
  ];
  for (const [overrides, event, status, code] of cases) {
    const { response } = await ask(
      shop,
      cateringRequest(shop, overrides, event),
    );
    assert.equal(response.status, status, JSON.stringify({ overrides, event }));
    assert.equal((await errorOf(response)).code, code);
  }
  assert.equal(
    shop.deps.db
      .prepare("SELECT count(*) FROM quote_requests WHERE store_id = ?")
      .pluck()
      .get(shop.storeId(daawatSlug)),
    0,
  );
});

test("a bulk cart needs her bulk items, each at its minimum", async () => {
  const shop = quoteApp();
  const kaju = kajuKatliId(shop);
  const good = await ask(shop, {
    kind: "bulk",
    store_id: shop.storeId(gharSlug),
    lines: [{ item_id: kaju, quantity: 600 }],
    need_by: shop.seed.saturday,
    place: "HSR Layout office",
    note: "Gift boxes with our logo",
  });
  assert.equal(good.response.status, 201, await good.response.clone().text());
  const answer = quoteAnswerSchema.parse(await good.response.json());
  assert.equal(answer.seller_phone, gharPhone);
  assert.deepEqual(answer.request, {
    kind: "bulk",
    lines: [
      {
        item_id: kaju,
        name: "Kaju katli",
        quantity: 600,
        unit: "pieces",
        price: 1500,
      },
    ],
    estimate: 600 * 1500,
    need_by: shop.seed.saturday,
    place: "HSR Layout office",
    note: "Gift boxes with our logo",
  });

  const heroItem = getMenu(shop.deps.db, shop.storeId("shobhas-kitchen"))[0]
    ?.id;
  assert.ok(heroItem);
  const cases: [unknown[], number, string][] = [
    [[{ item_id: kaju, quantity: 499 }], 400, "invalid_input"],
    [[{ item_id: heroItem, quantity: 600 }], 409, "item_unavailable"],
    [
      [
        { item_id: kaju, quantity: 500 },
        { item_id: kaju, quantity: 500 },
      ],
      400,
      "invalid_input",
    ],
  ];
  for (const [lines, status, code] of cases) {
    const { response } = await ask(shop, {
      kind: "bulk",
      store_id: shop.storeId(gharSlug),
      lines: lines as { item_id: string; quantity: number }[],
      need_by: null,
      place: null,
      note: null,
    });
    assert.equal(response.status, status, JSON.stringify(lines));
    assert.equal((await errorOf(response)).code, code);
  }
});

test("a store with its bulk section off, or catering off, takes no such request", async () => {
  const shop = quoteApp();
  shop.deps.db
    .prepare("UPDATE stores SET catering_on = 0 WHERE slug = ?")
    .run(daawatSlug);
  const { response } = await ask(shop, cateringRequest(shop));
  assert.equal(response.status, 409);
  assert.equal((await errorOf(response)).code, "store_not_taking_orders");
  const bulk = await ask(shop, {
    kind: "bulk",
    store_id: shop.storeId("ammas-murukku-corner"),
    lines: [{ item_id: randomUUID(), quantity: 1 }],
    need_by: null,
    place: null,
    note: null,
  });
  assert.equal(bulk.response.status, 409);
  assert.equal((await errorOf(bulk.response)).code, "store_not_taking_orders");
});

test("the company contacts a store that answered its board post", async () => {
  const shop = quoteApp();
  const token = demoBoardToken("whitefield-diwali");
  const { response } = await ask(shop, {
    kind: "board_post",
    store_id: shop.storeId(gharSlug),
    board_post: token,
    note: "Can you share samples?",
  });
  assert.equal(response.status, 201, await response.clone().text());
  const answer = quoteAnswerSchema.parse(await response.json());
  assert.equal(answer.request.kind, "board_post");
  if (answer.request.kind !== "board_post") return;
  assert.equal(answer.request.company, "A tech company in Whitefield");
  assert.equal(
    answer.request.store_note,
    "We can do both. Samples on WhatsApp.",
  );
  assert.equal(answer.request.budget_per_unit, 25_000);

  const other = await ask(shop, {
    kind: "board_post",
    store_id: shop.storeId("shobhas-kitchen"),
    board_post: token,
    note: null,
  });
  assert.equal(other.response.status, 404);
  const unknown = await ask(shop, {
    kind: "board_post",
    store_id: shop.storeId(gharSlug),
    board_post: "no-such-board-post-token",
    note: null,
  });
  assert.equal(unknown.response.status, 404);
});

test("her desk lists her own quote requests, newest first, with the buyer's contact", async () => {
  const shop = quoteApp();
  const first = await ask(shop, cateringRequest(shop));
  shop.deps.clock.now();
  const second = await ask(shop, cateringRequest(shop, { note: "Less spicy" }));
  await ask(shop, {
    kind: "bulk",
    store_id: shop.storeId(gharSlug),
    lines: [{ item_id: kajuKatliId(shop), quantity: 500 }],
    need_by: null,
    place: null,
    note: null,
  });
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);

  const cookie = await shop.sellerCookie(daawatPhone);
  const response = await shop.app.request("/api/desk/quotes", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const { quotes } = deskQuotesSchema.parse(await response.json());
  assert.equal(quotes.length, 2);
  assert.ok(quotes.every(({ kind }) => kind === "catering"));
  assert.deepEqual(quotes[0]?.buyer, {
    name: "Meera Iyer",
    phone: second.phone,
    language: "en",
  });
  assert.equal(quotes[0]?.request.note, "Less spicy");
  assert.equal(quotes[0]?.note_translation, null);

  const signedOut = await shop.app.request("/api/desk/quotes");
  assert.equal(signedOut.status, 401);
});

test("a quote request needs a proof and a valid body", async () => {
  const shop = quoteApp();
  const noProof = await shop.post("/api/quotes", {
    proof: "x".repeat(43),
    buyer_name: "Meera",
    language: "en",
    request: cateringRequest(shop),
  });
  assert.equal(noProof.status, 401);
  const noKey = await postJson(shop.app, "/api/quotes", {});
  assert.equal(noKey.status, 400);
  assert.equal((await errorOf(noKey)).code, "idempotency_key_missing");
  const bad = await shop.post("/api/quotes", { request: { kind: "picnic" } });
  assert.equal(bad.status, 400);
  assert.equal((await errorOf(bad)).code, "invalid_input");
});
