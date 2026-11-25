import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createApi } from "../api/api.ts";
import {
  eventsUrl,
  openDesk,
  takeDemoToken,
  demoHeader,
  demoTokenKey,
  type TokenStore,
} from "./access.ts";

const deskAnswer = {
  store: {
    id: "c36aaa8f-ac70-86b9-a181-80bade5b717d",
    slug: "shobhas-kitchen",
    name: "Shobha's Kitchen",
    area: "Basavanagudi",
    city: "Bengaluru",
    is_demo: true,
    limit_unit: "kg",
    daily_limit: 25_000,
    offers_pickup: true,
    offers_delivery: true,
    paused: false,
    bulk_on: false,
    catering_on: false,
    normal_orders_on: true,
  },
  voice_samples: true,
  seller_language: "kn",
  menu: [],
  closed_dates: [],
  flags: { ops_voice: true },
  recorded: true,
};

test("a demo link keeps its token for the tab and leaves the address bar", () => {
  const tokens = memoryStore();
  const { token, cleaned } = takeDemoToken(
    new URL("https://app.example/desk?demo=secret-token-123&lang=en"),
    tokens,
  );
  assert.equal(token, "secret-token-123");
  assert.equal(cleaned?.href, "https://app.example/desk?lang=en");
  assert.equal(tokens.getItem(demoTokenKey), "secret-token-123");
});

test("a reload of the demo desk finds the token of the tab", () => {
  const tokens = memoryStore({ [demoTokenKey]: "secret-token-123" });
  assert.deepEqual(takeDemoToken(new URL("https://app.example/desk"), tokens), {
    token: "secret-token-123",
    cleaned: undefined,
  });
});

test("an empty demo parameter is only removed", () => {
  const tokens = memoryStore();
  const { token, cleaned } = takeDemoToken(
    new URL("https://app.example/desk?demo="),
    tokens,
  );
  assert.equal(token, undefined);
  assert.equal(cleaned?.href, "https://app.example/desk");
});

test("each call of the demo desk sends the token in a header", async () => {
  const seen: (string | null)[] = [];
  const api = createApi({
    headers: () => ({ [demoHeader]: "secret-token-123" }),
    fetch: async (_input, init) => {
      seen.push(new Headers(init.headers).get("X-Demo-Token"));
      return Response.json(deskAnswer);
    },
  });
  await api.get("/api/desk/store", z.unknown());
  await api.send(
    "PATCH",
    "/api/desk/orders/1",
    { action: "paid" },
    z.unknown(),
  );
  assert.deepEqual(seen, ["secret-token-123", "secret-token-123"]);
});

test("the events URL takes the token in the query", () => {
  assert.equal(eventsUrl(undefined), "/api/desk/events");
  assert.equal(eventsUrl("secret token"), "/api/desk/events?demo=secret+token");
});

test("a session opens her desk", async () => {
  const api = createApi({ fetch: deskServer(true) });
  const opened = await openDesk({
    api,
    demoToken: undefined,
    tokens: memoryStore(),
  });
  assert.equal(opened.kind, "desk");
  if (opened.kind === "desk")
    assert.equal(opened.desk.store.name, "Shobha's Kitchen");
});

test("no session shows the sign-in, from an answer that is not an error", async () => {
  const asked: string[] = [];
  const answers: number[] = [];
  const server = deskServer(false);
  const api = createApi({
    fetch: async (input, init) => {
      asked.push(input);
      const response = await server(input, init);
      answers.push(response.status);
      return response;
    },
  });
  assert.deepEqual(
    await openDesk({ api, demoToken: undefined, tokens: memoryStore() }),
    { kind: "sign_in", demoRefused: false },
  );
  assert.deepEqual(asked, ["/api/desk/session"]);
  assert.deepEqual(answers, [200]);
});

test("a session that ends before the store loads shows the sign-in", async () => {
  const api = createApi({
    fetch: async (input) =>
      input === "/api/desk/session"
        ? Response.json({ signed_in: true })
        : notSignedIn(),
  });
  assert.deepEqual(
    await openDesk({ api, demoToken: undefined, tokens: memoryStore() }),
    { kind: "sign_in", demoRefused: false },
  );
});

test("a refused demo link is forgotten, and the sign-in says why", async () => {
  const tokens = memoryStore({ [demoTokenKey]: "old-token-1234567" });
  const api = createApi({ fetch: deskServer(false) });
  assert.deepEqual(
    await openDesk({ api, demoToken: "old-token-1234567", tokens }),
    { kind: "sign_in", demoRefused: true },
  );
  assert.equal(tokens.getItem(demoTokenKey), null);
});

test("other failures reach the page, which says what to do next", async () => {
  const api = createApi({
    fetch: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  await assert.rejects(
    openDesk({ api, demoToken: undefined, tokens: memoryStore() }),
    { code: "network" },
  );
});

function deskServer(signedIn: boolean) {
  return async (input: string, _init?: RequestInit): Promise<Response> => {
    if (input === "/api/desk/session") {
      return Response.json({ signed_in: signedIn });
    }
    return signedIn ? Response.json(deskAnswer) : notSignedIn();
  };
}

function notSignedIn(): Response {
  return Response.json(
    { error: { code: "not_signed_in", message: "Sign in." } },
    { status: 401 },
  );
}

function memoryStore(initial: Record<string, string> = {}): TokenStore {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}
