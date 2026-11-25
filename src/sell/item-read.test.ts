import assert from "node:assert/strict";
import { test } from "node:test";
import type { ItemReadAnswer, PartAnswer } from "../../shared/reading.ts";
import { createApi } from "../api/api.ts";
import { readItemText, readItemVoice, type ReadStep } from "./item-read.ts";

type Call = { url: string; body: unknown };

const answer: ItemReadAnswer = {
  transcript: "Kaju katli, twelve hundred rupees a kilo",
  language: "en-IN",
  path: "ai",
  outcome: "ok",
  show_manual: false,
  recorded: true,
  placeholder: true,
  item: null,
};

function partId(marker: number): string {
  return `00000000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
}

function fakeServer({ expireFirstRead = false } = {}) {
  const calls: Call[] = [];
  let reads = 0;
  const api = createApi({
    online: () => true,
    fetch: async (url, init) => {
      if (init.body instanceof Blob) {
        const marker = new Uint8Array(await init.body.arrayBuffer())[0] ?? 0;
        calls.push({ url, body: marker });
        const part: PartAnswer = {
          part_id: partId(marker),
          transcript: "Kaju katli",
          language: "en-IN",
          language_probability: 0.9,
          seconds: 2,
          recorded: true,
          placeholder: true,
        };
        return Response.json(part, { status: 201 });
      }
      calls.push({ url, body: JSON.parse(String(init.body)) });
      reads += 1;
      if (expireFirstRead && reads === 1) {
        return Response.json(
          { error: { code: "parts_expired", message: "x" } },
          { status: 410 },
        );
      }
      return Response.json(answer);
    },
  });
  return { api, calls };
}

function wav(marker: number): Blob {
  return new Blob([new Uint8Array([marker, 0, 0, 0])], { type: "audio/wav" });
}

test("each part goes up in order, then one reading fills the item", async () => {
  const { api, calls } = fakeServer();
  const steps: ReadStep[] = [];
  const result = await readItemVoice(api, [wav(1), wav(2)], {
    onStep: (step) => steps.push(step),
  });
  assert.deepEqual(result, answer);
  assert.deepEqual(calls, [
    { url: "/api/sell/read/parts", body: 1 },
    { url: "/api/sell/read/parts", body: 2 },
    { url: "/api/sell/items/read", body: { part_ids: [partId(1), partId(2)] } },
  ]);
  assert.deepEqual(steps, [
    { kind: "sending", part: 1, of: 2 },
    { kind: "sending", part: 2, of: 2 },
    { kind: "reading" },
  ]);
});

test("expired parts go up once more", async () => {
  const { api, calls } = fakeServer({ expireFirstRead: true });
  await readItemVoice(api, [wav(1)]);
  assert.deepEqual(
    calls.map(({ url }) => url),
    [
      "/api/sell/read/parts",
      "/api/sell/items/read",
      "/api/sell/read/parts",
      "/api/sell/items/read",
    ],
  );
});

test("typed words go up trimmed, in one reading", async () => {
  const { api, calls } = fakeServer();
  await readItemText(api, "  Kaju katli, 1200 a kilo  ");
  assert.deepEqual(calls, [
    { url: "/api/sell/items/read", body: { text: "Kaju katli, 1200 a kilo" } },
  ]);
});

test("a voice note with no part is a mistake of the page", async () => {
  const { api } = fakeServer();
  await assert.rejects(readItemVoice(api, []), /at least one part/);
});
