import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Hono } from "hono";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  coverAnswerSchema,
  publishAnswerSchema,
  setupStateSchema,
  slugCheckSchema,
  slugSuggestionSchema,
  type SetupItem,
  type SetupStoreBody,
} from "../../shared/setup.ts";
import { storePageSchema } from "../../shared/store.ts";
import {
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
} from "../../shared/verify.ts";
import type { AppDeps } from "../app.ts";
import { searchForm } from "../catalog/search-form.ts";
import { createSearchIndex } from "../catalog/search-index.ts";
import { parseConfig } from "../config.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import type { AppEnv } from "../http/context.ts";
import type { SarvamAnswer, SarvamTransport } from "../sarvam/api.ts";
import { createTestApp } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { postJson } from "../verify/test-sign-in.ts";

const phone = "+919845012345";
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(t: TestContext, overrides: Partial<AppDeps> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "setup-routes-"));
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    DATA_DIR: dataDir,
  });
  assert.ok(parsed.ok);
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  return {
    ...createTestApp({ config: parsed.config, ...overrides }),
    dataDir,
  };
}

async function publishSignIn(app: Hono<AppEnv>, number = phone) {
  const start = await postJson(app, "/api/verify/start", {
    phone: number,
    purpose: "publish",
  });
  assert.equal(start.status, 201, await start.clone().text());
  const { code } = verifyStartAnswerSchema.parse(await start.json());
  const check = await postJson(app, "/api/verify/check", {
    phone: number,
    purpose: "publish",
    code,
  });
  assert.equal(check.status, 200, await check.clone().text());
  const cookie = check.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  const answer = verifyCheckAnswerSchema.parse(await check.json());
  assert.ok(answer.purpose === "publish");
  return { cookie, store: answer.store };
}

function call(
  app: Hono<AppEnv>,
  method: string,
  path: string,
  {
    cookie,
    body,
    headers = {},
  }: {
    cookie?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const isBytes = body instanceof Uint8Array;
  return Promise.resolve(
    app.request(path, {
      method,
      headers: {
        ...(body === undefined || isBytes
          ? {}
          : { "Content-Type": "application/json" }),
        ...(cookie === undefined ? {} : { Cookie: cookie }),
        ...headers,
      },
      body:
        body === undefined ? undefined : isBytes ? body : JSON.stringify(body),
    }),
  );
}

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

function storeBody(overrides: Partial<SetupStoreBody> = {}): SetupStoreBody {
  return {
    language: "kn",
    name: "Lakshmi's Kitchen",
    slug: "lakshmis-kitchen",
    offers_pickup: true,
    offers_delivery: false,
    area: "Jayanagar",
    city: "Bengaluru",
    address: "7, 9th Main, Jayanagar",
    location: { lat: 12.925, lng: 77.5938 },
    ...overrides,
  };
}

function menuItem(name: string, overrides: Partial<SetupItem> = {}): SetupItem {
  return {
    id: randomUUID(),
    name,
    name_latin: null,
    category: "savouries",
    veg_mark: "veg",
    box_contents: null,
    packs: [250, 500, 1000].map((grams) => ({
      id: randomUUID(),
      label: grams < 1000 ? `${grams} g` : "1 kg",
      grams,
      pieces: null,
      price: grams * 40,
    })),
    ...overrides,
  };
}

const agreed = { whatsapp_updates: true, food_safety: true };
const publishHeaders = () => ({ "Idempotency-Key": randomUUID() });

async function draftStore(app: Hono<AppEnv>, items: SetupItem[]) {
  const { cookie } = await publishSignIn(app);
  const id = randomUUID();
  const saved = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody(),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const menu = await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie,
    body: { items },
  });
  assert.equal(menu.status, 200, await menu.clone().text());
  return { cookie, id };
}

test("a new seller verifies, saves her store and menu, and publishes it", async (t) => {
  const { app } = setup(t);
  const signedIn = await publishSignIn(app);
  assert.equal(signedIn.store, null);

  const id = randomUUID();
  const saved = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie: signedIn.cookie,
    body: storeBody(),
  });
  assert.equal(saved.status, 200);
  const state = setupStateSchema.parse(await saved.json());
  assert.equal(state.store.published, false);
  assert.equal(state.store.language, "kn");
  assert.equal(state.store.has_location, true);
  assert.equal(state.store.has_address, true);
  assert.equal((await app.request("/api/stores/lakshmis-kitchen")).status, 404);

  const chakkuli = menuItem("ಚಕ್ಕುಲಿ", { name_latin: "Chakkuli" });
  const box = menuItem("Diwali box", {
    category: "sweets",
    box_contents: "Mysore pak, kaju katli",
  });
  const menu = await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie: signedIn.cookie,
    body: { items: [chakkuli, box] },
  });
  assert.equal(menu.status, 200);
  assert.equal(setupStateSchema.parse(await menu.json()).items.length, 2);

  const published = await call(app, "POST", `/api/desk/stores/${id}/publish`, {
    cookie: signedIn.cookie,
    body: agreed,
    headers: publishHeaders(),
  });
  assert.equal(published.status, 200, await published.clone().text());
  assert.deepEqual(publishAnswerSchema.parse(await published.json()), {
    store: { id, slug: "lakshmis-kitchen", name: "Lakshmi's Kitchen" },
    url: "http://localhost:8080/s/lakshmis-kitchen",
    qr_svg: "/api/stores/lakshmis-kitchen/qr.svg",
  });

  const page = storePageSchema.parse(
    await (await app.request("/api/stores/lakshmis-kitchen")).json(),
  );
  assert.equal(page.store.name, "Lakshmi's Kitchen");
  assert.equal(page.store.area, "Jayanagar");
  assert.deepEqual(
    page.sections.map((section) => section.category),
    ["sweets", "savouries"],
  );
  const shownBox = page.sections[0]?.items[0];
  assert.equal(shownBox?.box_contents, "Mysore pak, kaju katli");
  assert.deepEqual(
    page.sections[1]?.items[0]?.packs.map((pack) => pack.price),
    [10_000, 20_000, 40_000],
  );
});

test("the answers never hold her pin or her address", async (t) => {
  const { app } = setup(t);
  const { cookie, id } = await draftStore(app, [menuItem("Chakkuli")]);
  const texts = [
    await (await call(app, "GET", `/api/desk/stores/${id}`, { cookie })).text(),
    await (
      await call(app, "PUT", `/api/desk/stores/${id}`, {
        cookie,
        body: storeBody(),
      })
    ).text(),
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /12\.925|77\.5938|9th Main|"lat"|"lng"/);
  }
});

test("the publish code signs her in, and the setup routes need it", async (t) => {
  const { app } = setup(t);
  const id = randomUUID();
  const refused = await call(app, "PUT", `/api/desk/stores/${id}`, {
    body: storeBody(),
  });
  assert.equal(refused.status, 401);
  assert.equal((await errorOf(refused)).code, "not_signed_in");

  const { cookie } = await publishSignIn(app);
  const fromAnotherSite = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody(),
    headers: { "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(fromAnotherSite.status, 403);
  const demo = await call(app, "PUT", `/api/desk/stores/${id}`, {
    body: storeBody(),
    headers: { "X-Demo-Token": "e2e-demo-desk-token-0000000000000000" },
  });
  assert.equal(demo.status, 401);
});

test("the publish code of a number with a store gives that store", async (t) => {
  const { app, deps } = setup(t);
  const kitchen = seedStore(deps.db);
  const { cookie, store } = await publishSignIn(app, kitchen.phone);
  assert.deepEqual(store, {
    id: kitchen.storeId,
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    published: true,
  });
  const second = await call(app, "PUT", `/api/desk/stores/${randomUUID()}`, {
    cookie,
    body: storeBody(),
  });
  assert.equal(second.status, 403);
  assert.equal((await errorOf(second)).code, "forbidden");
});

test("a link check gives a free link, or the next free one", async (t) => {
  const { app, deps } = setup(t);
  seedStore(deps.db);
  seedStore(deps.db, { slug: "shobhas-kitchen-2", phone: "+919800000002" });
  const check = async (path: string) => {
    const response = await app.request(path);
    assert.equal(response.status, 200);
    return slugCheckSchema.parse(await response.json());
  };
  assert.deepEqual(await check("/api/sell/slugs/lakshmis-kitchen"), {
    slug: "lakshmis-kitchen",
    available: true,
    suggestion: null,
  });
  assert.deepEqual(await check("/api/sell/slugs/shobhas-kitchen"), {
    slug: "shobhas-kitchen",
    available: false,
    suggestion: "shobhas-kitchen-3",
  });
  const bad = await app.request("/api/sell/slugs/Shobhas--Kitchen");
  assert.equal(bad.status, 400);
});

test("a store name with no Latin letters gets a free link from its Latin form, or a made-up one", async (t) => {
  const { sarvam, asked } = fakeSarvam({ "दूसरी दुकान": "Doosri Dukaan" });
  const { app, deps } = setup(t, { sarvam });
  seedStore(deps.db);
  const suggest = async (name: string) => {
    const response = await app.request(
      `/api/sell/slug-suggestion?name=${encodeURIComponent(name)}`,
    );
    assert.equal(response.status, 200, await response.clone().text());
    return slugSuggestionSchema.parse(await response.json());
  };
  assert.deepEqual(await suggest("Shobha's Kitchen"), {
    slug: "shobhas-kitchen-2",
    from: "name",
  });
  assert.deepEqual(await suggest("दूसरी दुकान"), {
    slug: "doosri-dukaan",
    from: "latin",
  });
  const madeUp = await suggest("ಅಮ್ಮನ ಅಡುಗೆ");
  assert.equal(madeUp.from, "made_up");
  assert.match(madeUp.slug, /^store-[a-z2-9]{4}$/);
  assert.deepEqual(asked.sort(), ["ಅಮ್ಮನ ಅಡುಗೆ", "दूसरी दुकान"].sort());
  const empty = await app.request("/api/sell/slug-suggestion?name=%20");
  assert.equal(empty.status, 400);
});

test("with ops_transliteration off, a Hindi store name still gets a made-up link", async (t) => {
  const { sarvam, asked } = fakeSarvam({ "दूसरी दुकान": "Doosri Dukaan" });
  const { app } = setup(t, {
    sarvam,
    flags: createDefaultFlags({ ops_transliteration: "off" }),
  });
  const answer = slugSuggestionSchema.parse(
    await (
      await app.request(
        `/api/sell/slug-suggestion?name=${encodeURIComponent("दूसरी दुकान")}`,
      )
    ).json(),
  );
  assert.equal(answer.from, "made_up");
  assert.deepEqual(asked, []);
});

test("her own draft keeps its link through a second try", async (t) => {
  const { app } = setup(t);
  const { id } = await draftStore(app, [menuItem("Chakkuli")]);
  const answer = slugCheckSchema.parse(
    await (
      await app.request(`/api/sell/slugs/lakshmis-kitchen?store=${id}`)
    ).json(),
  );
  assert.equal(answer.available, true);
  const other = slugCheckSchema.parse(
    await (await app.request("/api/sell/slugs/lakshmis-kitchen")).json(),
  );
  assert.equal(other.available, false);
});

test("a link that another store has is refused with 409", async (t) => {
  const { app, deps } = setup(t);
  seedStore(deps.db);
  const { cookie } = await publishSignIn(app);
  const response = await call(app, "PUT", `/api/desk/stores/${randomUUID()}`, {
    cookie,
    body: storeBody({ slug: "shobhas-kitchen" }),
  });
  assert.equal(response.status, 409);
  assert.equal((await errorOf(response)).code, "invalid_input");
});

test("another seller can neither read nor change her store", async (t) => {
  const { app } = setup(t);
  const { id } = await draftStore(app, [menuItem("Chakkuli")]);
  const other = await publishSignIn(app, "+919845099999");
  const read = await call(app, "GET", `/api/desk/stores/${id}`, {
    cookie: other.cookie,
  });
  assert.equal(read.status, 404);
  const write = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie: other.cookie,
    body: storeBody({ slug: "taken-over" }),
  });
  assert.equal(write.status, 403);
  const items = await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie: other.cookie,
    body: { items: [menuItem("Nippattu")] },
  });
  assert.equal(items.status, 404);
});

test("an item id of another store is refused, and nothing changes", async (t) => {
  const { app, deps } = setup(t);
  const kitchen = seedStore(deps.db);
  const { cookie, id } = await draftStore(app, [menuItem("Chakkuli")]);
  const stolen = menuItem("Mysore pak", { id: kitchen.items.mysorePak.id });
  const response = await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie,
    body: { items: [menuItem("Kodubale"), stolen] },
  });
  assert.equal(response.status, 403);
  const state = setupStateSchema.parse(
    await (await call(app, "GET", `/api/desk/stores/${id}`, { cookie })).json(),
  );
  assert.deepEqual(
    state.items.map((item) => item.name),
    ["Chakkuli"],
  );
  const mysorePak = deps.db
    .prepare("SELECT store_id, name FROM items WHERE id = ?")
    .get(kitchen.items.mysorePak.id);
  assert.deepEqual(mysorePak, {
    store_id: kitchen.storeId,
    name: "Mysore pak",
  });
});

test("a new menu changes packs, and an item with orders only leaves the menu", async (t) => {
  const { app, deps } = setup(t);
  const chakkuli = menuItem("Chakkuli");
  const nippattu = menuItem("Nippattu");
  const { cookie, id } = await draftStore(app, [chakkuli, nippattu]);
  const firstPack = nippattu.packs[0];
  assert.ok(firstPack);
  deps.db
    .prepare(
      `INSERT INTO orders (id, store_id, number, token, source, status,
        fulfilment, day, total, created_at)
      VALUES ('o1', ?, 1, 'token-of-16-chars', 'link', 'new', 'pickup',
        '2026-11-28', 10000, 0)`,
    )
    .run(id);
  deps.db
    .prepare(
      "INSERT INTO order_items (order_id, item_id, pack_id, quantity, price, grams) VALUES ('o1', ?, ?, 1, 10000, 250)",
    )
    .run(nippattu.id, firstPack.id);

  const cheaper = {
    ...chakkuli,
    packs: chakkuli.packs.slice(1).map((pack) => ({ ...pack, price: 15_000 })),
  };
  const response = await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie,
    body: { items: [cheaper] },
  });
  assert.equal(response.status, 200);
  const state = setupStateSchema.parse(await response.json());
  assert.deepEqual(
    state.items.map((item) => [item.name, item.packs.map((p) => p.price)]),
    [["Chakkuli", [15_000, 15_000]]],
  );
  const kept = deps.db
    .prepare("SELECT in_menu FROM items WHERE id = ?")
    .pluck()
    .get(nippattu.id);
  assert.equal(kept, 0);
});

test("one item can be saved and removed on its own", async (t) => {
  const { app } = setup(t);
  const chakkuli = menuItem("Chakkuli");
  const { cookie, id } = await draftStore(app, [chakkuli]);
  const laddu = menuItem("Besan laddu", { category: "sweets" });
  const saved = await call(
    app,
    "PUT",
    `/api/desk/stores/${id}/items/${laddu.id}`,
    {
      cookie,
      body: laddu,
    },
  );
  assert.equal(saved.status, 200);
  assert.equal(setupStateSchema.parse(await saved.json()).items.length, 2);
  const mismatch = await call(
    app,
    "PUT",
    `/api/desk/stores/${id}/items/${randomUUID()}`,
    { cookie, body: laddu },
  );
  assert.equal(mismatch.status, 400);
  const removed = await call(
    app,
    "DELETE",
    `/api/desk/stores/${id}/items/${chakkuli.id}`,
    { cookie },
  );
  assert.equal(removed.status, 200);
  assert.deepEqual(
    setupStateSchema.parse(await removed.json()).items.map((i) => i.name),
    ["Besan laddu"],
  );
  const again = await call(
    app,
    "DELETE",
    `/api/desk/stores/${id}/items/${chakkuli.id}`,
    { cookie },
  );
  assert.equal(again.status, 404);
});

function fakeSarvam(latin: Record<string, string>) {
  const asked: string[] = [];
  const sarvam: SarvamTransport = {
    mode: "live",
    send: async (request): Promise<SarvamAnswer> => {
      const input = String(request.input);
      asked.push(input);
      const text = request.api === "transliterate" ? latin[input] : undefined;
      return text === undefined
        ? {
            ok: false,
            outcome: "error",
            status: 500,
            code: null,
            missing: false,
          }
        : {
            ok: true,
            status: 200,
            body: { transliterated_text: text },
            placeholder: false,
          };
    },
  };
  return { sarvam, asked };
}

async function savedLatin(app: Hono<AppEnv>, cookie: string, id: string) {
  const state = setupStateSchema.parse(
    await (await call(app, "GET", `/api/desk/stores/${id}`, { cookie })).json(),
  );
  return Object.fromEntries(
    state.items.map((item) => [item.name, item.name_latin]),
  );
}

test("an item name in an Indian script gets its Latin form at save, so search finds it", async (t) => {
  const { sarvam, asked } = fakeSarvam({
    "ಮೈಸೂರು ಪಾಕ್": "Mysore pak",
    ಕೋಡುಬಳೆ: "Kodubale",
    ನಿಪ್ಪಟ್ಟು: "N".repeat(61),
  });
  const { app, deps } = setup(t, { sarvam });
  const mysorePak = menuItem("ಮೈಸೂರು ಪಾಕ್", { category: "sweets" });
  const { cookie, id } = await draftStore(app, [
    mysorePak,
    menuItem("ಚಕ್ಕುಲಿ"),
    menuItem("ಕಾಜು ಕಟ್ಲಿ", { name_latin: "Kaju katli" }),
    menuItem("Nippattu"),
    menuItem("ನಿಪ್ಪಟ್ಟು"),
  ]);
  const kodubale = menuItem("ಕೋಡುಬಳೆ");
  const one = await call(
    app,
    "PUT",
    `/api/desk/stores/${id}/items/${kodubale.id}`,
    {
      cookie,
      body: kodubale,
    },
  );
  assert.equal(one.status, 200, await one.clone().text());
  assert.deepEqual(await savedLatin(app, cookie, id), {
    "ಮೈಸೂರು ಪಾಕ್": "Mysore pak",
    ಚಕ್ಕುಲಿ: null,
    "ಕಾಜು ಕಟ್ಲಿ": "Kaju katli",
    Nippattu: null,
    ನಿಪ್ಪಟ್ಟು: null,
    ಕೋಡುಬಳೆ: "Kodubale",
  });
  assert.deepEqual(
    asked.sort(),
    ["ಕೋಡುಬಳೆ", "ಚಕ್ಕುಲಿ", "ನಿಪ್ಪಟ್ಟು", "ಮೈಸೂರು ಪಾಕ್"].sort(),
  );
  const index = createSearchIndex(deps.db);
  index.sync();
  assert.deepEqual(
    index.trigram(searchForm("mysore pak")).map((hit) => hit.id),
    [mysorePak.id],
  );
});

test("with no saved answer or with ops_transliteration off, the item saves with its name only", async (t) => {
  const recorded = setup(t);
  const draft = await draftStore(recorded.app, [menuItem("ಮೈಸೂರು ಪಾಕ್")]);
  assert.deepEqual(await savedLatin(recorded.app, draft.cookie, draft.id), {
    "ಮೈಸೂರು ಪಾಕ್": null,
  });
  const { sarvam, asked } = fakeSarvam({ "ಮೈಸೂರು ಪಾಕ್": "Mysore pak" });
  const off = setup(t, {
    sarvam,
    flags: createDefaultFlags({ ops_transliteration: "off" }),
  });
  const offDraft = await draftStore(off.app, [menuItem("ಮೈಸೂರು ಪಾಕ್")]);
  assert.deepEqual(await savedLatin(off.app, offDraft.cookie, offDraft.id), {
    "ಮೈಸೂರು ಪಾಕ್": null,
  });
  assert.deepEqual(asked, []);
  const variants = off
    .logs()
    .map((line) => line.flags as { ops_transliteration?: string } | undefined);
  assert.ok(variants.some((flags) => flags?.ops_transliteration === "off"));
});

test("publish needs a menu, both agreements and an idempotency key", async (t) => {
  const { app } = setup(t);
  const { cookie } = await publishSignIn(app);
  const id = randomUUID();
  await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody(),
  });
  const publish = (body: unknown, headers = publishHeaders()) =>
    call(app, "POST", `/api/desk/stores/${id}/publish`, {
      cookie,
      body,
      headers,
    });
  const noMenu = await publish(agreed);
  assert.equal(noMenu.status, 400);
  await call(app, "PUT", `/api/desk/stores/${id}/items`, {
    cookie,
    body: { items: [menuItem("Chakkuli")] },
  });
  assert.equal(
    (await publish({ whatsapp_updates: true, food_safety: false })).status,
    400,
  );
  const noKey = await publish(agreed, {} as ReturnType<typeof publishHeaders>);
  assert.equal((await errorOf(noKey)).code, "idempotency_key_missing");
  const key = publishHeaders();
  assert.equal((await publish(agreed, key)).status, 200);
  const replay = await publish(agreed, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get("Idempotent-Replayed"), "true");
});

test("after publish, she can change her link one time", async (t) => {
  const { app } = setup(t);
  const { cookie, id } = await draftStore(app, [menuItem("Chakkuli")]);
  const before = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody({ slug: "lakshmi-snacks" }),
  });
  assert.equal(
    setupStateSchema.parse(await before.json()).store.slug_changed,
    false,
  );
  await call(app, "POST", `/api/desk/stores/${id}/publish`, {
    cookie,
    body: agreed,
    headers: publishHeaders(),
  });
  const once = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody({ slug: "lakshmis-kitchen" }),
  });
  assert.equal(
    setupStateSchema.parse(await once.json()).store.slug_changed,
    true,
  );
  const twice = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody({ slug: "lakshmi-sweets" }),
  });
  assert.equal(twice.status, 403);
  const sameLink = await call(app, "PUT", `/api/desk/stores/${id}`, {
    cookie,
    body: storeBody({ name: "Lakshmi's Snacks" }),
  });
  assert.equal(sameLink.status, 200);
});

test("the QR code of a public store is an SVG of its link", async (t) => {
  const { app, deps } = setup(t);
  seedStore(deps.db);
  const response = await app.request("/api/stores/shobhas-kitchen/qr.svg");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type") ?? "", /^image\/svg\+xml/);
  const svg = await response.text();
  assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /#1f1a16/);
  assert.equal((await app.request("/api/stores/nobody/qr.svg")).status, 404);
  const { id } = await draftStore(app, [menuItem("Chakkuli")]);
  assert.ok(id);
  assert.equal(
    (await app.request("/api/stores/lakshmis-kitchen/qr.svg")).status,
    404,
  );
});

test("a cover photo is stored as a file, served, replaced and removed", async (t) => {
  const { app, dataDir } = setup(t);
  const { cookie, id } = await draftStore(app, [menuItem("Chakkuli")]);
  const upload = (bytes: Uint8Array, type: string) =>
    call(app, "PUT", `/api/desk/stores/${id}/cover`, {
      cookie,
      body: bytes,
      headers: { "Content-Type": type },
    });

  const first = await upload(jpeg, "image/jpeg");
  assert.equal(first.status, 200, await first.clone().text());
  const { cover_photo: url } = coverAnswerSchema.parse(await first.json());
  assert.ok(url !== null && url.startsWith(`/api/photos/${id}-`));
  const served = await app.request(url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "image/jpeg");
  assert.match(served.headers.get("Cache-Control") ?? "", /immutable/);
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), jpeg);
  const file = join(dataDir, "photos", url.slice("/api/photos/".length));
  assert.ok(existsSync(file));

  const second = await upload(png, "image/png");
  const { cover_photo: next } = coverAnswerSchema.parse(await second.json());
  assert.notEqual(next, url);
  assert.equal(existsSync(file), false);

  const removed = await call(app, "DELETE", `/api/desk/stores/${id}/cover`, {
    cookie,
  });
  assert.deepEqual(await removed.json(), { cover_photo: null });
  assert.equal((await app.request(next ?? "")).status, 404);
});

test("a cover photo must be a JPEG, PNG or WebP of 2 MB at most", async (t) => {
  const { app } = setup(t);
  const { cookie, id } = await draftStore(app, [menuItem("Chakkuli")]);
  const upload = (bytes: Uint8Array, type: string) =>
    call(app, "PUT", `/api/desk/stores/${id}/cover`, {
      cookie,
      body: bytes,
      headers: { "Content-Type": type },
    });
  assert.equal((await upload(png, "image/jpeg")).status, 415);
  assert.equal((await upload(jpeg, "image/gif")).status, 415);
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  big.set(jpeg);
  const tooBig = await upload(big, "image/jpeg");
  assert.equal(tooBig.status, 413);
  assert.equal((await app.request("/api/photos/..%2Fapp.db")).status, 404);
});

test("the logs of setup hold no phone number", async (t) => {
  const { app, lines } = setup(t);
  await draftStore(app, [menuItem("Chakkuli")]);
  assert.ok(lines.length > 0);
  for (const line of lines) assert.doesNotMatch(line, /9845012345/);
});
