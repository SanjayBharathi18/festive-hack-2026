import assert from "node:assert/strict";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import { parseConfig } from "../config.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { heroSlug } from "../demo/seed.ts";
import { deskAuth, demoTokenHeader, sameSecret } from "./desk-auth.ts";
import { postJson, signIn, startCode } from "./test-sign-in.ts";

const demoToken = "demo-token-for-the-tests-0123456789";

function setup(env: Record<string, string> = {}, heroIsDemo = true) {
  const parsed = parseConfig({
    SESSION_SECRET: "test-session-secret-of-32-characters",
    SARVAM_MODE: "recorded",
    ...env,
  });
  assert.ok(parsed.ok);
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock, config: parsed.config });
  const auth = deskAuth(deps);
  app.get("/api/desk/test", auth, (c) => c.json(c.get("desk")));
  app.post("/api/desk/test", auth, (c) => c.json(c.get("desk")));
  const hero = seedStore(deps.db, { isDemo: heroIsDemo });
  const kitchen = seedStore(deps.db, {
    slug: "test-kitchen",
    name: "Test Kitchen",
    phone: "+919800000002",
    dailyLimit: null,
  });
  const other = seedStore(deps.db, {
    slug: "ghar-ki-mithai",
    phone: "+919800000003",
    isDemo: true,
  });
  return { app, deps, clock, hero, kitchen, other };
}

async function codeOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error.code;
}

test("the seller cookie is signed, HttpOnly, SameSite=Lax and lasts 90 days", async () => {
  const { app, kitchen } = setup();
  const code = await startCode(app, kitchen.phone, "desk");
  const response = await postJson(app, "/api/verify/check", {
    phone: kitchen.phone,
    purpose: "desk",
    code,
  });
  const cookie = response.headers.get("Set-Cookie") ?? "";
  const [pair, ...attributes] = cookie.split("; ");
  assert.match(pair ?? "", /^__Host-desk_session=[\w-]{43}\.[\w%]+$/);
  assert.deepEqual(attributes.sort(), [
    "HttpOnly",
    "Max-Age=7776000",
    "Path=/",
    "SameSite=Lax",
    "Secure",
  ]);
});

test("the cookie keeps the __Host- rules, also on http://localhost", async () => {
  const { app, kitchen } = setup();
  const cookie = await signInResponseCookie(app, kitchen.phone);
  assert.match(cookie, /^__Host-desk_session=/);
  assert.match(cookie, /; Path=\/(;|$)/);
  assert.match(cookie, /; Secure(;|$)/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("the cookie opens the desk of her own store for 90 days", async () => {
  const { app, clock, kitchen } = setup();
  const cookie = await signIn(app, kitchen.phone);
  const response = await app.request("/api/desk/test", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    storeId: kitchen.storeId,
    sellerId: kitchen.sellerId,
    slug: "test-kitchen",
    isDemo: false,
    via: "session",
  });
  clock.advance(90 * 24 * 60 * 60 * 1000);
  const later = await app.request("/api/desk/test", {
    headers: { Cookie: cookie },
  });
  assert.equal(later.status, 401);
  assert.equal(await codeOf(later), "not_signed_in");
});

test("a cookie that the server did not sign does not open the desk", async () => {
  const { app, kitchen } = setup();
  const cookie = await signIn(app, kitchen.phone);
  const token = decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0];
  for (const forged of [
    `__Host-desk_session=${token}`,
    `__Host-desk_session=${token}.c2lnbmF0dXJl`,
    "__Host-desk_session=",
    `desk_session=${cookie.split("=").slice(1).join("=")}`,
  ]) {
    const response = await app.request("/api/desk/test", {
      headers: { Cookie: forged },
    });
    assert.equal(response.status, 401, forged);
  }
});

test("with no cookie and no token, the desk asks her to sign in", async () => {
  const { app } = setup({ DEMO_DESK_TOKEN: demoToken });
  const response = await app.request("/api/desk/test");
  assert.equal(response.status, 401);
  assert.equal(await codeOf(response), "not_signed_in");
});

test("the demo token opens the desk of the hero store, and only that desk", async () => {
  const { app, hero, kitchen, other } = setup({ DEMO_DESK_TOKEN: demoToken });
  const response = await app.request("/api/desk/test", {
    headers: { [demoTokenHeader]: demoToken },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    storeId: hero.storeId,
    sellerId: hero.sellerId,
    slug: heroSlug,
    isDemo: true,
    via: "demo",
  });
  const cookie = await signIn(app, kitchen.phone);
  const both = await app.request("/api/desk/test", {
    headers: { Cookie: cookie, [demoTokenHeader]: demoToken },
  });
  assert.equal(((await both.json()) as { slug: string }).slug, heroSlug);
  const otherDemo = await app.request(
    `/api/desk/test?demo=${demoToken}&store=${other.storeId}`,
  );
  assert.equal(
    ((await otherDemo.json()) as { storeId: string }).storeId,
    hero.storeId,
  );
});

test("the demo token opens nothing when the hero store is not a demo store", async () => {
  const { app } = setup({ DEMO_DESK_TOKEN: demoToken }, false);
  const response = await app.request("/api/desk/test", {
    headers: { [demoTokenHeader]: demoToken },
  });
  assert.equal(response.status, 404);
  assert.equal(await codeOf(response), "not_found");
});

test("a wrong demo token is refused", async () => {
  const { app } = setup({ DEMO_DESK_TOKEN: demoToken });
  for (const wrong of [`${demoToken}x`, demoToken.slice(1), "", "short"]) {
    const response = await app.request("/api/desk/test", {
      headers: { [demoTokenHeader]: wrong },
    });
    assert.equal(response.status, 401, wrong);
  }
});

test("without DEMO_DESK_TOKEN, there is no demo desk", async () => {
  const { app } = setup();
  const response = await app.request("/api/desk/test", {
    headers: { [demoTokenHeader]: demoToken },
  });
  assert.equal(response.status, 401);
  assert.match(
    errorBodySchema.parse(await response.json()).error.message,
    /no demo desk/,
  );
});

test("a GET can carry the demo token as ?demo=, a POST cannot", async () => {
  const { app } = setup({ DEMO_DESK_TOKEN: demoToken });
  const path = `/api/desk/test?demo=${demoToken}`;
  assert.equal((await app.request(path)).status, 200);
  assert.equal((await app.request(path, { method: "POST" })).status, 401);
});

test("the demo desk link and the demo token create nothing", async () => {
  const { app, deps } = setup({ DEMO_DESK_TOKEN: demoToken });
  await app.request(`/desk?demo=${demoToken}`);
  await app.request(`/api/desk/test?demo=${demoToken}`);
  const response = await app.request("/api/desk/test", {
    headers: { [demoTokenHeader]: demoToken },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.equal(
    deps.db.prepare("SELECT count(*) FROM sessions").pluck().get(),
    0,
  );
});

test("a desk write from another site is refused, a read is not", async () => {
  const { app, kitchen } = setup({ DEMO_DESK_TOKEN: demoToken });
  const cookie = await signIn(app, kitchen.phone);
  const post = (headers: Record<string, string>) =>
    app.request("/api/desk/test", {
      method: "POST",
      headers: { Cookie: cookie, ...headers },
    });
  for (const headers of [
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
    { Origin: "https://1-2-3-4.sslip.io" },
    { "Sec-Fetch-Site": "cross-site", [demoTokenHeader]: demoToken },
  ] as Record<string, string>[]) {
    const response = await post(headers);
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.equal(await codeOf(response), "forbidden");
  }
  for (const headers of [
    { "Sec-Fetch-Site": "same-origin" },
    { Origin: "http://localhost:8080" },
    {},
  ] as Record<string, string>[]) {
    assert.equal((await post(headers)).status, 200, JSON.stringify(headers));
  }
  const read = await app.request("/api/desk/test", {
    headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(read.status, 200);
});

test("a desk sign-in from another site is refused", async () => {
  const { app, kitchen } = setup();
  const code = await startCode(app, kitchen.phone, "desk");
  const response = await postJson(
    app,
    "/api/verify/check",
    { phone: kitchen.phone, purpose: "desk", code },
    { "Sec-Fetch-Site": "cross-site" },
  );
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("sameSecret compares tokens of any length", () => {
  assert.equal(sameSecret(demoToken, demoToken), true);
  assert.equal(sameSecret(`${demoToken}x`, demoToken), false);
  assert.equal(sameSecret("", demoToken), false);
  assert.equal(sameSecret(demoToken.toUpperCase(), demoToken), false);
});

async function signInResponseCookie(
  app: Parameters<typeof startCode>[0],
  phone: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const code = await startCode(app, phone, "desk");
  const response = await postJson(
    app,
    "/api/verify/check",
    { phone, purpose: "desk", code },
    headers,
  );
  assert.equal(response.status, 200);
  return response.headers.get("Set-Cookie") ?? "";
}
