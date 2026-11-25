import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartReadAnswer, PartAnswer } from "../../shared/reading.ts";
import { createApi, isApiError } from "../api/api.ts";
import { readVoiceCart, type ReadStep } from "./voice-cart.ts";

type Call = { url: string; body: unknown };

test("each part goes up, then one reading of all the parts", async () => {
  const { api, calls } = fakeServer();
  const steps: ReadStep[] = [];
  const answer = await readVoiceCart(
    { api, slug: "shobhas-kitchen", via: "market" },
    [wav(1), wav(2)],
    { onStep: (step) => steps.push(step) },
  );
  assert.equal(answer.cart.items.length, 0);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "/api/cart/read/parts?store=shobhas-kitchen",
      "/api/cart/read/parts?store=shobhas-kitchen",
      "/api/cart/read",
    ],
  );
  assert.deepEqual(calls[2]?.body, {
    store: "shobhas-kitchen",
    part_ids: [partId(1), partId(2)],
    via: "market",
  });
  assert.deepEqual(steps, [
    { kind: "sending", part: 1, of: 2 },
    { kind: "sending", part: 2, of: 2 },
    { kind: "reading" },
  ]);
});

test("a link buyer sends no via", async () => {
  const { api, calls } = fakeServer();
  await readVoiceCart({ api, slug: "shobhas-kitchen" }, [wav(1)]);
  assert.deepEqual(calls.at(-1)?.body, {
    store: "shobhas-kitchen",
    part_ids: [partId(1)],
  });
});

test("expired parts go up once more", async () => {
  const { api, calls } = fakeServer({ expireFirstRead: true });
  await readVoiceCart({ api, slug: "shobhas-kitchen" }, [wav(1)]);
  assert.equal(calls.filter((call) => call.url.includes("/parts")).length, 2);
  assert.equal(calls.filter((call) => call.url === "/api/cart/read").length, 2);
});

test("a failed part stops the reading with its error", async () => {
  const { api, calls } = fakeServer({ failParts: true });
  await assert.rejects(
    readVoiceCart({ api, slug: "shobhas-kitchen" }, [wav(1), wav(2)]),
    (error) => isApiError(error) && error.code === "speech_failed",
  );
  assert.equal(calls.length, 1);
});

test("a cancelled reading stops", async () => {
  const { api } = fakeServer();
  await assert.rejects(
    readVoiceCart({ api, slug: "shobhas-kitchen" }, [wav(1)], {
      signal: AbortSignal.abort(),
    }),
    { name: "AbortError" },
  );
});

function fakeServer({
  expireFirstRead = false,
  failParts = false,
}: { expireFirstRead?: boolean; failParts?: boolean } = {}) {
  const calls: Call[] = [];
  let reads = 0;
  const api = createApi({
    fetch: async (url, init) => {
      if (init.body instanceof Blob) {
        const bytes = new Uint8Array(await init.body.arrayBuffer());
        calls.push({ url, body: bytes[0] });
        if (failParts) {
          return Response.json(
            { error: { code: "speech_failed", message: "x" } },
            { status: 502 },
          );
        }
        return Response.json(part(bytes[0] ?? 0), { status: 201 });
      }
      calls.push({ url, body: JSON.parse(String(init.body)) });
      reads += 1;
      if (expireFirstRead && reads === 1) {
        return Response.json(
          { error: { code: "parts_expired", message: "x" } },
          { status: 410 },
        );
      }
      return Response.json(answer());
    },
  });
  return { api, calls };
}

function wav(marker: number): Blob {
  return new Blob([new Uint8Array([marker, 0, 0, 0])], { type: "audio/wav" });
}

function partId(marker: number): string {
  return `00000000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
}

function part(marker: number): PartAnswer {
  return {
    part_id: partId(marker),
    transcript: "one kilo Mysore pak",
    language: "en-IN",
    language_probability: 0.9,
    seconds: 2,
    recorded: true,
    placeholder: false,
  };
}

function answer(): CartReadAnswer {
  return {
    transcript: "one kilo Mysore pak",
    language: "en-IN",
    path: "ai",
    variant: "native",
    outcome: "ok",
    show_manual: false,
    recorded: true,
    placeholder: false,
    trace: {
      segment: "lang_en",
      flags_from: "defaults",
      in_experiment: false,
      duration_ms: 12,
      show: false,
    },
    cart: { items: [], unmatched: [], day: null, total: 0 },
  };
}
