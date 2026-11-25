import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { addDays } from "../../shared/day.ts";
import { deskBoardSchema, deskOrderAnswerSchema } from "../../shared/orders.ts";
import { storePageSchema } from "../../shared/store.ts";
import type { FlagValues } from "../flags/decisions.ts";
import { createDefaultFlags } from "../flags/default-flags.ts";
import type {
  SarvamAnswer,
  SarvamRequest,
  SarvamTransport,
} from "../sarvam/api.ts";
import { createTestApp } from "../test-app.ts";
import { seedStore } from "../test-store.ts";
import { postJson, signIn } from "../verify/test-sign-in.ts";

const hindiNote = "कम मीठा रखिए";

function fakeSarvam() {
  const requests: SarvamRequest[] = [];
  const sarvam: SarvamTransport = {
    mode: "live",
    send: async (request): Promise<SarvamAnswer> => {
      requests.push(request);
      const target = String(request.settings?.target_language_code);
      const body =
        request.api === "translate"
          ? { translated_text: `${target} ${String(request.input)}` }
          : { transliterated_text: `${target} ${String(request.input)}` };
      return { ok: true, status: 200, body, placeholder: false };
    },
  };
  return { sarvam, requests };
}

function setup(flags: Partial<FlagValues> = {}) {
  const { sarvam, requests } = fakeSarvam();
  const testApp = createTestApp({ sarvam, flags: createDefaultFlags(flags) });
  const store = seedStore(testApp.deps.db, { language: "kn" });
  testApp.deps.db
    .prepare("UPDATE items SET name = ?, name_latin = ? WHERE id = ?")
    .run("ಮೈಸೂರು ಪಾಕ್", "Mysore pak", store.items.mysorePak.id);
  testApp.deps.db
    .prepare("UPDATE items SET name_latin = name WHERE id = ?")
    .run(store.items.kajuKatli.id);
  return { ...testApp, store, requests };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function storeItems(app: ReturnType<typeof setup>["app"], query = "") {
  const response = await app.request(`/api/stores/shobhas-kitchen${query}`);
  assert.equal(response.status, 200);
  const page = storePageSchema.parse(await response.json());
  return Object.fromEntries(
    page.sections
      .flatMap(({ items }) => items)
      .map(({ name, name_script }) => [name, name_script]),
  );
}

test("GET /api/stores/:slug?lang= adds each name in the buyer's script", async () => {
  const { app, requests } = setup();
  assert.deepEqual(await storeItems(app, "?lang=hi"), {
    "ಮೈಸೂರು ಪಾಕ್": "hi-IN Mysore pak",
    "Kaju katli": "hi-IN Kaju katli",
    Chakkuli: null,
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ api }) => api === "transliterate"));
  assert.deepEqual(await storeItems(app, "?lang=hi"), {
    "ಮೈಸೂರು ಪಾಕ್": "hi-IN Mysore pak",
    "Kaju katli": "hi-IN Kaju katli",
    Chakkuli: null,
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(await storeItems(app, "?lang=kn"), {
    "ಮೈಸೂರು ಪಾಕ್": null,
    "Kaju katli": "kn-IN Kaju katli",
    Chakkuli: null,
  });
  assert.deepEqual(await storeItems(app, "?lang=en"), {
    "ಮೈಸೂರು ಪಾಕ್": "Mysore pak",
    "Kaju katli": null,
    Chakkuli: null,
  });
});

test("with no lang, an unknown lang or ops_transliteration off, names stay as they are", async () => {
  const { app, requests } = setup({ ops_transliteration: "off" });
  for (const query of ["", "?lang=fr", "?lang=hi"]) {
    const names = await storeItems(app, query);
    assert.ok(
      Object.values(names).every((name) => name === null),
      query,
    );
  }
  assert.equal(requests.length, 0);
});

async function deskOrder(
  testApp: ReturnType<typeof setup>,
  note: string | null,
) {
  const cookie = await signIn(testApp.app, testApp.store.phone);
  const response = await postJson(
    testApp.app,
    "/api/desk/orders",
    {
      day: addDays("2026-11-24", 2),
      fulfilment: "pickup",
      note,
      buyer_name: "Neha",
      cart: [
        { pack_id: testApp.store.items.kajuKatli.packs[0].id, quantity: 1 },
      ],
    },
    { Cookie: cookie, "Idempotency-Key": randomUUID() },
  );
  assert.equal(response.status, 201, await response.clone().text());
  const board = async () => {
    const answer = await testApp.app.request("/api/desk/orders", {
      headers: { Cookie: cookie },
    });
    assert.equal(answer.status, 200);
    return deskBoardSchema
      .parse(await answer.json())
      .days.flatMap(({ slips }) => slips);
  };
  return { answer: deskOrderAnswerSchema.parse(await response.json()), board };
}

test("the desk slip gets the note in the seller's language", async () => {
  const testApp = setup();
  const { answer, board } = await deskOrder(testApp, hindiNote);
  assert.equal(answer.order.note, hindiNote);
  await tick();
  const [slip] = await board();
  assert.equal(slip?.note, hindiNote);
  assert.deepEqual(slip?.note_translation, {
    text: `kn-IN ${hindiNote}`,
    language: "kn",
  });
  const translations = testApp.requests.filter(
    ({ api }) => api === "translate",
  );
  assert.equal(translations.length, 1);
  assert.deepEqual(translations[0]?.body, {
    input: hindiNote,
    source_language_code: "auto",
    target_language_code: "kn-IN",
    model: "mayura:v1",
    mode: "modern-colloquial",
  });
});

test("a note in the seller's script, or no note, has no translation", async () => {
  const testApp = setup();
  const { board } = await deskOrder(testApp, "ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ");
  await deskOrder(testApp, null);
  await tick();
  const slips = await board();
  assert.equal(slips.length, 2);
  assert.ok(slips.every((slip) => slip.note_translation === null));
  assert.equal(testApp.requests.length, 0);
});

test("with ops_translation off, the slip shows the original only", async () => {
  const testApp = setup({ ops_translation: "off" });
  const { board } = await deskOrder(testApp, hindiNote);
  await tick();
  const [slip] = await board();
  assert.equal(slip?.note_translation, null);
  assert.equal(testApp.requests.length, 0);
});
