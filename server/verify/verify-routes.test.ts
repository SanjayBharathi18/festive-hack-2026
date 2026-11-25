import assert from "node:assert/strict";
import { test } from "node:test";
import { errorBodySchema } from "../../shared/errors.ts";
import {
  verifyCheckAnswerSchema,
  verifyStartAnswerSchema,
} from "../../shared/verify.ts";
import { readDemoFixture } from "../demo/demo-fixture.ts";
import { heroSlug, seedDemo, testSlug } from "../demo/seed.ts";
import { createTestApp, createTestClock } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { postJson, signIn, startCode } from "./test-sign-in.ts";

const buyer = "+919876543210";

function setup() {
  const clock = createTestClock();
  const test = createTestApp({ clock });
  const store = seedStore(test.deps.db);
  return { ...test, clock, store };
}

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

test("start gives a 6-digit code, marked as prototype", async () => {
  const { app, clock } = setup();
  const response = await postJson(app, "/api/verify/start", {
    phone: "98765 43210",
    purpose: "order",
  });
  assert.equal(response.status, 201);
  const answer = verifyStartAnswerSchema.parse(await response.json());
  assert.equal(answer.prototype, true);
  assert.equal(answer.expires_at, clock.now() + 5 * 60_000);
});

test("start refuses a number that is not a WhatsApp number", async () => {
  const { app } = setup();
  for (const body of [
    { phone: "12345", purpose: "order" },
    { phone: buyer, purpose: "payment" },
    { phone: buyer },
  ]) {
    const response = await postJson(app, "/api/verify/start", body);
    assert.equal(response.status, 400);
    assert.equal((await errorOf(response)).code, "invalid_input");
  }
});

test("start for the desk needs the number of a store", async () => {
  const { app, store } = setup();
  const response = await postJson(app, "/api/verify/start", {
    phone: buyer,
    purpose: "desk",
  });
  assert.equal(response.status, 404);
  assert.equal((await errorOf(response)).code, "seller_not_found");
  assert.match(await startCode(app, store.phone, "desk"), /^\d{6}$/);
});

test("the hero seller gets no desk or publish code; another demo seller, test-kitchen's seller and a new number do", async () => {
  const clock = createTestClock();
  const { app, deps } = createTestApp({ clock });
  seedDemo(deps.db, clock);
  const { stores } = readDemoFixture();
  const storeOf = (slug: string) => {
    const store = stores.find((candidate) => candidate.slug === slug);
    assert.ok(store, slug);
    return store;
  };
  const hero = storeOf(heroSlug);
  assert.equal(hero.is_demo, true);
  for (const purpose of ["desk", "publish"]) {
    for (const [path, body] of [
      ["/api/verify/start", { phone: hero.seller.phone, purpose }],
      [
        "/api/verify/check",
        { phone: hero.seller.phone, purpose, code: "123456" },
      ],
    ] as const) {
      const response = await postJson(app, path, body);
      assert.equal(response.status, 403, `${path} ${purpose}`);
      const error = await errorOf(response);
      assert.equal(error.code, "use_demo_link");
      assert.match(error.message, /demo desk link/);
    }
  }

  const ghar = storeOf("ghar-ki-mithai");
  assert.equal(ghar.is_demo, true);
  assert.match(await signIn(app, ghar.seller.phone), /^__Host-desk_session=/);
  const kitchen = storeOf(testSlug);
  assert.equal(kitchen.is_demo, false);
  assert.match(
    await signIn(app, kitchen.seller.phone),
    /^__Host-desk_session=/,
  );

  const code = verifyStartAnswerSchema.parse(
    await (
      await postJson(app, "/api/verify/start", {
        phone: buyer,
        purpose: "publish",
      })
    ).json(),
  ).code;
  const published = await postJson(app, "/api/verify/check", {
    phone: buyer,
    purpose: "publish",
    code,
  });
  assert.equal(published.status, 200, await published.clone().text());
  assert.deepEqual(verifyCheckAnswerSchema.parse(await published.json()), {
    purpose: "publish",
    store: null,
  });
});

test("start gives a number 3 codes in 15 minutes", async () => {
  const { app } = setup();
  for (let index = 0; index < 3; index += 1) {
    await startCode(app, buyer, "order");
  }
  const limited = await postJson(app, "/api/verify/start", {
    phone: buyer,
    purpose: "order",
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "900");
  const error = await errorOf(limited);
  assert.equal(error.code, "rate_limited");
  assert.match(error.message, /15 minutes/);
});

test("start gives an IP 60 codes an hour, so people on one network can share one", async () => {
  const { app } = setup();
  const from = { "X-Forwarded-For": "203.0.113.9" };
  for (let index = 0; index < 60; index += 1) {
    const phone = `+9198765000${String(index).padStart(2, "0")}`;
    const response = await postJson(
      app,
      "/api/verify/start",
      { phone, purpose: "order" },
      from,
    );
    assert.equal(response.status, 201);
  }
  const limited = await postJson(
    app,
    "/api/verify/start",
    { phone: buyer, purpose: "order" },
    from,
  );
  assert.equal(limited.status, 429);
});

test("check of an order code gives a proof", async () => {
  const { app, clock, deps } = setup();
  const code = await startCode(app, buyer, "order");
  const response = await postJson(app, "/api/verify/check", {
    phone: buyer,
    purpose: "order",
    code: `${code.slice(0, 3)} ${code.slice(3)}`,
  });
  assert.equal(response.status, 200);
  const answer = verifyCheckAnswerSchema.parse(await response.json());
  assert.equal(answer.purpose, "order");
  assert.ok(answer.purpose === "order");
  assert.equal(answer.expires_at, clock.now() + 15 * 60_000);
  const stored = JSON.stringify(
    deps.db.prepare("SELECT * FROM sessions").all(),
  );
  assert.doesNotMatch(stored, new RegExp(answer.proof));
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("check of a wrong code says how many tries are left", async () => {
  const { app } = setup();
  const code = await startCode(app, buyer, "order");
  const wrong = code === "000000" ? "000001" : "000000";
  const response = await postJson(app, "/api/verify/check", {
    phone: buyer,
    purpose: "order",
    code: wrong,
  });
  assert.equal(response.status, 400);
  const error = await errorOf(response);
  assert.equal(error.code, "code_wrong");
  assert.match(error.message, /4 tries left/);
});

test("check of an old or used code asks for a new code", async () => {
  const { app, clock } = setup();
  const check = (code: string) =>
    postJson(app, "/api/verify/check", {
      phone: buyer,
      purpose: "order",
      code,
    });
  const code = await startCode(app, buyer, "order");
  assert.equal((await check(code)).status, 200);
  assert.equal((await errorOf(await check(code))).code, "code_used");
  const old = await startCode(app, buyer, "order");
  clock.advance(5 * 60_000);
  assert.equal((await errorOf(await check(old))).code, "code_expired");
});

test("check refuses a body that is not a code", async () => {
  const { app } = setup();
  for (const code of ["12345", "1234567", "abcdef"]) {
    const response = await postJson(app, "/api/verify/check", {
      phone: buyer,
      purpose: "order",
      code,
    });
    assert.equal(response.status, 400);
    assert.equal((await errorOf(response)).code, "invalid_input");
  }
});

test("check of a desk code signs the seller in to her store", async () => {
  const { app, store } = setup();
  const code = await startCode(app, store.phone, "desk");
  const response = await postJson(app, "/api/verify/check", {
    phone: store.phone,
    purpose: "desk",
    code,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(verifyCheckAnswerSchema.parse(await response.json()), {
    purpose: "desk",
    store: { slug: "shobhas-kitchen", name: "Shobha's Kitchen" },
  });
  assert.match(
    response.headers.get("Set-Cookie") ?? "",
    /^__Host-desk_session=/,
  );
});

test("the logs of the verify routes hold no phone number and no code", async () => {
  const { app, lines } = setup();
  const code = await startCode(app, buyer, "order");
  await postJson(app, "/api/verify/check", {
    phone: buyer,
    purpose: "order",
    code,
  });
  const log = lines.join("\n");
  assert.doesNotMatch(log, /98765/);
  assert.doesNotMatch(log, new RegExp(code));
});

test("check of a publish code makes her seller record once and signs her in", async () => {
  const { app, deps } = setup();
  const newSeller = "+919845012345";
  for (const round of [1, 2]) {
    const start = await postJson(app, "/api/verify/start", {
      phone: newSeller,
      purpose: "publish",
    });
    assert.equal(start.status, 201);
    const { code } = verifyStartAnswerSchema.parse(await start.json());
    const response = await postJson(app, "/api/verify/check", {
      phone: newSeller,
      purpose: "publish",
      code,
    });
    assert.equal(response.status, 200, `round ${round}`);
    assert.deepEqual(verifyCheckAnswerSchema.parse(await response.json()), {
      purpose: "publish",
      store: null,
    });
    assert.match(
      response.headers.get("Set-Cookie") ?? "",
      /^__Host-desk_session=/,
    );
  }
  const sellers = deps.db
    .prepare("SELECT language, verified_at FROM sellers WHERE phone = ?")
    .all(newSeller);
  assert.deepEqual(sellers, [{ language: "en", verified_at: null }]);
});

test("a publish code of a number with a store gives that store", async () => {
  const { app, store } = setup();
  const code = await startCode(app, store.phone, "desk");
  assert.match(code, /^\d{6}$/);
  const start = await postJson(app, "/api/verify/start", {
    phone: store.phone,
    purpose: "publish",
  });
  const publishCode = verifyStartAnswerSchema.parse(await start.json()).code;
  const wrongPurpose = await postJson(app, "/api/verify/check", {
    phone: store.phone,
    purpose: "desk",
    code: publishCode === code ? "000000" : publishCode,
  });
  assert.equal(wrongPurpose.status, 400);
  const response = await postJson(app, "/api/verify/check", {
    phone: store.phone,
    purpose: "publish",
    code: publishCode,
  });
  assert.deepEqual(verifyCheckAnswerSchema.parse(await response.json()), {
    purpose: "publish",
    store: {
      id: store.storeId,
      slug: "shobhas-kitchen",
      name: "Shobha's Kitchen",
      published: true,
    },
  });
});
