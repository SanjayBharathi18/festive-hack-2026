import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  cateringSearchAnswerSchema,
  deskPackageAnswerSchema,
  deskPackagesSchema,
  planCheckAnswerSchema,
  type PackageInput,
} from "../../shared/catering.ts";
import { errorBodySchema } from "../../shared/errors.ts";
import { storePageSchema } from "../../shared/store.ts";
import {
  daawatPhone,
  daawatSlug,
  gharPhone,
  gharSlug,
  quoteApp,
} from "../quotes/test-quote-app.ts";
import { daawatInputs } from "./test-packages.ts";

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

async function search(shop: ReturnType<typeof quoteApp>, query = "") {
  const response = await shop.app.request(`/api/catering/search${query}`);
  assert.equal(response.status, 200, await response.clone().text());
  return cateringSearchAnswerSchema.parse(await response.json());
}

const offerNames = (answer: { caterers: { packages: { name: string }[] }[] }) =>
  answer.caterers.flatMap(({ packages }) => packages.map(({ name }) => name));

test("the Catering tab lists Daawat with the packages that fit the filters", async () => {
  const shop = quoteApp();
  const all = await search(shop);
  assert.equal(all.today, shop.seed.day);
  assert.deepEqual(
    all.caterers.map(({ store }) => store.slug),
    [daawatSlug],
  );
  assert.equal(all.caterers[0]?.store.is_demo, true);
  assert.deepEqual(all.caterers[0]?.packages[0]?.style_extras, {
    staff: 4_000,
    live_counters: 7_500,
  });
  assert.deepEqual(offerNames(all), ["Silver plate", "Gold plate", "Buffet"]);
  assert.deepEqual(all.caterers[0]?.packages[0]?.limits[0], {
    name: "Sweets",
    min: 1,
    max: 2,
  });

  assert.deepEqual(offerNames(await search(shop, "?guests=120")), [
    "Silver plate",
    "Gold plate",
  ]);
  assert.deepEqual(offerNames(await search(shop, "?max_price=40000")), [
    "Silver plate",
    "Buffet",
  ]);
  assert.deepEqual(offerNames(await search(shop, "?food=jain")), ["Buffet"]);
  assert.deepEqual((await search(shop, "?food=jain&guests=120")).caterers, []);
  assert.deepEqual(
    (await search(shop, `?date=${shop.seed.sunday}`)).caterers,
    [],
    "booked caterers do not show",
  );
  assert.equal(
    (await search(shop, `?date=${shop.seed.saturday}`)).caterers.length,
    1,
  );
});

test("each caterer has her stars, or none while she has no rating", async () => {
  const shop = quoteApp();
  const set = shop.deps.db.prepare(
    "UPDATE stores SET rating_average = ?, rating_count = ? WHERE slug = ?",
  );
  set.run(null, 0, daawatSlug);
  assert.equal((await search(shop)).caterers[0]?.rating, null);
  set.run(4.56, 12, daawatSlug);
  assert.deepEqual((await search(shop)).caterers[0]?.rating, {
    average: 4.6,
    count: 12,
  });
});

test("the Catering tab keeps to the city of the buyer, by any of its names", async () => {
  const shop = quoteApp();
  const bengaluru = await search(shop, "?city=Bangalore");
  assert.ok(bengaluru.caterers.some(({ store }) => store.slug === daawatSlug));
  assert.ok(
    bengaluru.caterers.every(({ store }) => store.city === "Bengaluru"),
  );
  assert.deepEqual((await search(shop, "?city=Udupi")).caterers, []);
});

test("a wrong filter is refused with the field", async () => {
  const shop = quoteApp();
  const response = await shop.app.request("/api/catering/search?food=vegan");
  assert.equal(response.status, 400);
  assert.match((await errorOf(response)).message, /food/);
});

test("the plate check refuses a third sweet on Silver and offers Gold and the buffet", async () => {
  const shop = quoteApp();
  const response = await shop.post("/api/catering/check", {
    store_id: shop.storeId(daawatSlug),
    package_id: shop.packageId("silver-plate"),
    dishes: [
      { category: "Sweets", dish: "Gulab jamun" },
      { category: "Sweets", dish: "Mysore pak" },
      { category: "Sweets", dish: "Payasam" },
    ],
  });
  assert.equal(response.status, 200);
  const answer = planCheckAnswerSchema.parse(await response.json());
  assert.deepEqual(answer.check.categories[0], {
    name: "Sweets",
    chosen: 3,
    min: 1,
    max: 2,
    over: true,
    missing: 0,
  });
  assert.equal(answer.check.ok, false);
  assert.deepEqual(
    answer.fitting.map(({ name }) => name),
    ["Gold plate", "Buffet"],
  );
  assert.equal(answer.fitting[0]?.price, 50_000);
  assert.equal(answer.fitting[0]?.max_total, 13);

  const missing = await shop.post("/api/catering/check", {
    store_id: shop.storeId(daawatSlug),
    package_id: randomUUID(),
    dishes: [],
  });
  assert.equal(missing.status, 404);
});

test("the store page has her catering section with booked dates, or her bulk section", async () => {
  const shop = quoteApp();
  const caterer = storePageSchema.parse(
    await (await shop.app.request(`/api/stores/${daawatSlug}`)).json(),
  );
  assert.equal(caterer.bulk, null);
  assert.deepEqual(
    caterer.catering?.packages.map(({ name }) => name),
    ["Silver plate", "Gold plate", "Buffet"],
  );
  assert.deepEqual(caterer.catering?.booked, [shop.seed.sunday]);
  assert.equal(caterer.store.normal_orders_on, false);
  const silver = caterer.catering?.packages[0];
  assert.equal(silver?.categories[0]?.dishes[0]?.name, "Gulab jamun");
  assert.equal(silver?.categories[0]?.dishes[0]?.jain, true);

  const bulk = storePageSchema.parse(
    await (await shop.app.request(`/api/stores/${gharSlug}`)).json(),
  );
  assert.equal(bulk.catering, null);
  assert.equal(bulk.bulk?.line, "Bulk and corporate orders taken");
  assert.deepEqual(
    bulk.bulk?.items.map(({ name, min_qty, unit, price }) => [
      name,
      min_qty,
      unit,
      price,
    ]),
    [
      ["Kaju katli", 500, "pieces", 1500],
      ["Assorted gift box (250 g)", 100, "pieces", null],
    ],
  );
  const hero = storePageSchema.parse(
    await (await shop.app.request("/api/stores/shobhas-kitchen")).json(),
  );
  assert.equal(hero.bulk?.line, "Diwali gift boxes for offices and families");
  assert.deepEqual(
    hero.bulk?.items.map(({ name_latin, min_qty, price }) => [
      name_latin,
      min_qty,
      price,
    ]),
    [["Diwali assorted box", 25, 42_000]],
  );
  assert.equal(hero.catering, null);
});

test("the package editor lists, adds, changes and removes her packages", async () => {
  const shop = quoteApp();
  const cookie = await shop.sellerCookie(daawatPhone);
  const desk = (method: string, path: string, body?: unknown) =>
    body === undefined
      ? Promise.resolve(
          shop.app.request(path, { method, headers: { Cookie: cookie } }),
        )
      : shop.send(method, path, body, {
          Cookie: cookie,
          "Idempotency-Key": randomUUID(),
        });

  const listed = deskPackagesSchema.parse(
    await (await desk("GET", "/api/desk/packages")).json(),
  );
  assert.equal(listed.catering_on, true);
  assert.equal(listed.packages.length, 3);

  const input: PackageInput = {
    ...daawatInputs().silver,
    name: "Wedding thali",
    price: 42_000,
  };
  const created = await desk("POST", "/api/desk/packages", input);
  assert.equal(created.status, 201, await created.clone().text());
  const { package: made } = deskPackageAnswerSchema.parse(await created.json());
  assert.equal(made.name, "Wedding thali");
  assert.equal(made.categories.length, 5);

  const changed = await desk("PUT", `/api/desk/packages/${made.id}`, {
    ...input,
    free_choice: true,
    max_total: 9,
  });
  assert.equal(changed.status, 200, await changed.clone().text());
  const { package: free } = deskPackageAnswerSchema.parse(await changed.json());
  assert.equal(free.id, made.id);
  assert.equal(free.free_choice, true);
  assert.equal(free.max_total, null);
  assert.deepEqual(
    free.categories.map(({ min, max }) => [min, max]),
    Array(5).fill([0, null]),
  );

  const priced = await desk("PUT", `/api/desk/packages/${made.id}`, {
    ...input,
    style_extras: { staff: 5_000, live_counters: 0 },
  });
  assert.equal(priced.status, 200, await priced.clone().text());
  assert.deepEqual(
    deskPackageAnswerSchema.parse(await priced.json()).package.style_extras,
    { staff: 5_000, live_counters: 0 },
  );
  const { style_extras: _, ...older } = input;
  const plain = await desk("PUT", `/api/desk/packages/${made.id}`, older);
  assert.equal(plain.status, 200, await plain.clone().text());
  assert.deepEqual(
    deskPackageAnswerSchema.parse(await plain.json()).package.style_extras,
    { staff: 0, live_counters: 0 },
    "a package with no extras adds nothing to its price",
  );

  const removed = await desk("DELETE", `/api/desk/packages/${made.id}`);
  assert.equal(removed.status, 200);
  assert.equal(
    deskPackageAnswerSchema.parse(await removed.json()).package.name,
    "Wedding thali",
  );
  assert.equal(
    (await desk("DELETE", `/api/desk/packages/${made.id}`)).status,
    404,
  );

  const other = await shop.sellerCookie(gharPhone);
  const foreign = await shop.send(
    "PUT",
    `/api/desk/packages/${shop.packageId("silver-plate")}`,
    input,
    { Cookie: other },
  );
  assert.equal(foreign.status, 404, "a seller changes only her own packages");
});

test("a package that cannot be kept is refused before it is saved", async () => {
  const shop = quoteApp();
  const cookie = await shop.sellerCookie(daawatPhone);
  const silver = daawatInputs().silver;
  const broken: unknown[] = [
    { ...silver, categories: [{ ...silver.categories[0], min: 3, max: 2 }] },
    { ...silver, service_styles: [] },
    { ...silver, max_total: 2 },
    {
      ...silver,
      categories: [
        {
          ...silver.categories[0],
          dishes: [{ name: "Chicken 65", veg_mark: "non_veg", jain: true }],
          min: 1,
        },
      ],
    },
  ];
  for (const body of broken) {
    const response = await shop.send("POST", "/api/desk/packages", body, {
      Cookie: cookie,
      "Idempotency-Key": randomUUID(),
    });
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 80));
  }
});

test("catering off hides her from the tab and her store page", async () => {
  const shop = quoteApp();
  const cookie = await shop.sellerCookie(daawatPhone);
  const off = await shop.send(
    "PUT",
    "/api/desk/catering",
    { catering_on: false },
    { Cookie: cookie },
  );
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { catering_on: false });
  assert.deepEqual((await search(shop)).caterers, []);
  const page = storePageSchema.parse(
    await (await shop.app.request(`/api/stores/${daawatSlug}`)).json(),
  );
  assert.equal(page.catering, null);
  const check = await shop.post("/api/catering/check", {
    store_id: shop.storeId(daawatSlug),
    package_id: shop.packageId("silver-plate"),
    dishes: [],
  });
  assert.equal(check.status, 404);
});

test("the desk package routes need her session", async () => {
  const shop = quoteApp();
  for (const [method, path] of [
    ["GET", "/api/desk/packages"],
    ["POST", "/api/desk/packages"],
    ["PUT", `/api/desk/packages/${randomUUID()}`],
    ["DELETE", `/api/desk/packages/${randomUUID()}`],
    ["PUT", "/api/desk/catering"],
  ] as const) {
    const response = await shop.app.request(path, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
  }
});
