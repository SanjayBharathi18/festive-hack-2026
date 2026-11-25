import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeskOrderAnswer, DeskOrderBody } from "../../shared/orders.ts";
import type {
  DeskReadAnswer,
  DeskReadBody,
  PartAnswer,
} from "../../shared/reading.ts";
import { z } from "zod";
import { createApi } from "../api/api.ts";
import { createWait } from "../wait/wait.ts";
import {
  createAddOrder,
  isRefusedFile,
  type AddOrderDeps,
  type Control,
  type Step,
} from "./add-order.ts";
import { withQuantity } from "./draft.ts";
import { fakeSlip } from "./test-slips.ts";

const mysoreKilo = "5f51e217-1da8-8358-9d21-196f83ea559f";
const vk1 = "ನಮಸ್ಕಾರ, ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಮತ್ತು ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು.";

function readAnswer(overrides: Partial<DeskReadAnswer> = {}): DeskReadAnswer {
  return {
    transcript: vk1,
    language: "kn-IN",
    path: "ai",
    variant: "native",
    outcome: "ok",
    show_manual: false,
    recorded: true,
    placeholder: false,
    trace: {
      segment: "lang_kn",
      flags_from: "defaults",
      in_experiment: true,
      duration_ms: 40,
      show: false,
    },
    translation: null,
    draft: {
      order_id: "5b100b90-c20d-418e-8c0e-2d593dda1118",
      items: [
        {
          item_id: "086ced7f-5846-8368-9591-69c03683048d",
          name: "ಮೈಸೂರು ಪಾಕ್",
          said: "ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್",
          asked: {
            quantity: 1,
            unit: "kg",
            pack_grams: null,
            pack_pieces: null,
          },
          packs: [
            {
              pack_id: mysoreKilo,
              label: "1 kg",
              quantity: 1,
              price: 88_000,
              grams: 1000,
              pieces: null,
            },
          ],
          near_amount: false,
          near_name: false,
          sold_out: false,
        },
      ],
      unmatched: [],
      day: "2026-11-28",
      fulfilment: "delivery",
      buyer_name: "ಪ್ರಿಯಾ",
      address: "ಜಯನಗರ",
      note: null,
      total: 88_000,
      capacity: null,
    },
    ...overrides,
  };
}

function apiError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function setup(overrides: Partial<AddOrderDeps> = {}) {
  const steps: Step[] = [];
  const reads: DeskReadBody[] = [];
  const saved: DeskOrderBody[] = [];
  const uploads: Blob[] = [];
  const busy: Control[] = [];
  const removed: string[] = [];
  let parts = 0;
  const deps: AddOrderDeps = {
    prepare: async (audio) => ({ parts: [audio, audio], seconds: 40 }),
    uploadPart: async (part): Promise<PartAnswer> => {
      uploads.push(part);
      parts += 1;
      return {
        part_id: `00000000-0000-4000-8000-${String(parts).padStart(12, "0")}`,
        transcript: `part ${parts}`,
        language: "kn-IN",
        language_probability: 0.9,
        seconds: 20,
        recorded: true,
        placeholder: false,
      };
    },
    read: async (body) => {
      reads.push(body);
      return readAnswer();
    },
    save: async (body): Promise<DeskOrderAnswer> => {
      saved.push(body);
      return { order: fakeSlip({ number: 18 }), warning: null };
    },
    remove: async (orderId) => {
      removed.push(orderId);
      return { removed: orderId };
    },
    waitFor: (control) =>
      createWait({
        control: {
          setAttribute: () => busy.push(control),
          removeAttribute: () => {},
        },
      }),
    words: {
      voice: "Reading the voice note",
      text: "Reading the order",
      saving: "Saving",
      undoing: "Taking it back",
    },
    ...overrides,
  };
  const flow = createAddOrder({ deps, onStep: (step) => steps.push(step) });
  return { flow, steps, reads, saved, uploads, removed };
}

test("a pasted text is read into a draft to check", async () => {
  const { flow, steps, reads } = setup();
  await flow.readText(vk1);
  assert.deepEqual(reads, [{ text: vk1 }]);
  assert.deepEqual(
    steps.map((step) => step.name),
    ["reading", "check"],
  );
  const step = flow.step;
  assert.equal(step.name, "check");
  if (step.name !== "check") return;
  assert.equal(step.manual, false);
  assert.equal(step.heard, vk1);
  assert.equal(step.draft.initial.lines.length, 1);
});

test("a voice note goes up in parts, then the parts are read in order", async () => {
  const { flow, reads, uploads } = setup();
  await flow.readVoice(new Blob(["voice"]), "record");
  assert.equal(uploads.length, 2);
  assert.deepEqual(reads, [
    {
      part_ids: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    },
  ]);
  assert.equal(flow.step.name, "check");
});

test("expired parts are sent once more", async () => {
  let tries = 0;
  const { flow, uploads } = setup({
    read: async () => {
      tries += 1;
      if (tries === 1) throw apiError("parts_expired");
      return readAnswer();
    },
  });
  await flow.readVoice(new Blob(["voice"]), "upload");
  assert.equal(uploads.length, 4);
  assert.equal(flow.step.name, "check");
});

test("a reading that failed shows the manual path, with the words heard", async () => {
  const { flow } = setup({
    read: async () =>
      readAnswer({
        outcome: "invalid",
        show_manual: true,
        draft: {
          ...readAnswer().draft,
          items: [],
          day: null,
          fulfilment: null,
        },
      }),
  });
  await flow.readText(vk1);
  const step = flow.step;
  assert.equal(step.name, "check");
  if (step.name !== "check") return;
  assert.equal(step.manual, true);
  assert.equal(step.heard, vk1);
  assert.equal(step.draft.initial.lines.length, 0);
  assert.ok(step.reading, "the reading still names the order");
});

test("a voice note that cannot be heard gives the manual path with its parts' words", async () => {
  const { flow } = setup({
    read: async () => Promise.reject(apiError("recording_missing")),
  });
  await flow.readVoice(new Blob(["voice"]), "upload");
  const step = flow.step;
  assert.equal(step.name, "check");
  if (step.name !== "check") return;
  assert.equal(step.manual, true);
  assert.equal(step.reading, undefined);
  assert.equal(step.heard, "part 1 part 2");
  assert.equal((step.error as { code: string }).code, "recording_missing");
});

test("voice orders turned off on the server give the manual path", async () => {
  const api = createApi({
    fetch: async () =>
      Response.json(
        { error: { code: "voice_off", message: "Voice orders are off." } },
        { status: 409 },
      ),
  });
  const { flow } = setup({
    uploadPart: async () => {
      throw await api.send("POST", "/x", {}, z.unknown()).catch((e) => e);
    },
  });
  await flow.readVoice(new Blob(["voice"]), "upload");
  const step = flow.step;
  assert.equal(step.name, "check");
  if (step.name !== "check") return;
  assert.equal(step.manual, true);
  assert.equal((step.error as { code: string }).code, "voice_off");
});

test("a file the phone cannot open gives the manual path", async () => {
  const { flow } = setup({
    prepare: async () => Promise.reject(apiError("cannot_decode")),
  });
  await flow.readVoice(new Blob(["voice"]), "upload");
  assert.equal(flow.step.name, "check");
});

test("no network keeps the source, and Try again reads it again", async () => {
  let fail = true;
  const { flow, reads } = setup({
    read: async (body) => {
      reads.push(body);
      if (fail) throw apiError("network");
      return readAnswer();
    },
  });
  await flow.readText(vk1);
  const step = flow.step;
  assert.equal(step.name, "input");
  if (step.name !== "input") return;
  assert.deepEqual(step.retry, { kind: "text", text: vk1 });
  fail = false;
  await flow.retry();
  assert.equal(flow.step.name, "check");
  assert.equal(reads.length, 2);
});

test("a microphone problem stays on the first step, and says what to do", async () => {
  const { flow } = setup({
    prepare: async () => Promise.reject(apiError("too_short")),
  });
  await flow.readVoice(new Blob(["voice"]), "record");
  assert.equal(flow.step.name, "input");
});

test("a newer reading cancels the older one", async () => {
  let release: (() => void) | undefined;
  const { flow, steps } = setup({
    read: (body, signal) =>
      new Promise((resolve, reject) => {
        if ("text" in body && body.text === "slow") {
          release = () => resolve(readAnswer());
          signal.addEventListener("abort", () => reject(signal.reason));
          return;
        }
        resolve(readAnswer({ transcript: "fast" }));
      }),
  });
  const slow = flow.readText("slow");
  await flow.readText("fast");
  release?.();
  await slow;
  const step = flow.step;
  assert.equal(step.name, "check");
  if (step.name === "check") assert.equal(step.heard, "fast");
  assert.equal(steps.filter((each) => each.name === "check").length, 1);
});

test("saving an unchanged draft says it was not edited", async () => {
  const { flow, saved } = setup();
  await flow.readText(vk1);
  const step = flow.step;
  if (step.name !== "check") throw new Error("no draft");
  await flow.save(structuredClone(step.draft.initial));
  assert.deepEqual(saved[0], {
    day: "2026-11-28",
    fulfilment: "delivery",
    address: "ಜಯನಗರ",
    note: null,
    buyer_name: "ಪ್ರಿಯಾ",
    cart: [{ pack_id: mysoreKilo, quantity: 1 }],
    source: "desk",
    reading: {
      order_id: "5b100b90-c20d-418e-8c0e-2d593dda1118",
      transcript: vk1,
      language: "kn-IN",
      variant: "native",
      edited: false,
    },
  });
  assert.equal(flow.step.name, "saved");
});

test("saving a changed draft says it was edited", async () => {
  const { flow, saved } = setup();
  await flow.readText(vk1);
  const step = flow.step;
  if (step.name !== "check") throw new Error("no draft");
  await flow.save(withQuantity(step.draft.initial, mysoreKilo, 2));
  assert.equal(saved[0]?.reading?.edited, true);
});

test("an order typed by hand is saved with no reading", async () => {
  const { flow, saved } = setup();
  flow.fillByHand();
  await flow.save({
    lines: [
      {
        item_id: "086ced7f-5846-8368-9591-69c03683048d",
        pack_id: mysoreKilo,
        name: "ಮೈಸೂರು ಪಾಕ್",
        label: "1 kg",
        quantity: 1,
        price: 88_000,
        grams: 1000,
        pieces: null,
      },
    ],
    day: "2026-11-29",
    fulfilment: "pickup",
    buyer_name: "",
    address: "",
    note: "",
  });
  assert.equal(saved[0]?.reading, null);
  assert.equal(saved[0]?.fulfilment, "pickup");
});

test("a draft with a missing field is not sent", async () => {
  const { flow, saved } = setup();
  await flow.readText(vk1);
  const step = flow.step;
  if (step.name !== "check") throw new Error("no draft");
  await flow.save({ ...step.draft.initial, day: null });
  assert.equal(saved.length, 0);
});

test("a failed save keeps the draft on the screen with the reason", async () => {
  const { flow } = setup({
    save: async () => Promise.reject(apiError("network")),
  });
  await flow.readText(vk1);
  const step = flow.step;
  if (step.name !== "check") throw new Error("no draft");
  await flow.save(step.draft.initial);
  const after = flow.step;
  assert.equal(after.name, "check");
  if (after.name === "check") {
    assert.equal((after.error as { code: string }).code, "network");
    assert.equal(after.draft, step.draft);
  }
});

test("Undo takes back the saved order and goes back to the check step with her values", async () => {
  const { flow, removed } = setup();
  await flow.readText(vk1);
  const step = flow.step;
  if (step.name !== "check") throw new Error("no draft");
  await flow.save(step.draft.initial);
  const saved = flow.step;
  if (saved.name !== "saved") throw new Error("not saved");
  const gone = await flow.undoSave();
  assert.equal(gone, saved.answer.order.id);
  assert.deepEqual(removed, [saved.answer.order.id]);
  const back = flow.step;
  assert.equal(back.name, "check");
  if (back.name === "check") {
    assert.equal(back.draft, step.draft);
    assert.equal(back.error, undefined);
  }
  assert.equal(await flow.undoSave(), undefined, "only a saved step undoes");
});

test("an order already gone counts as taken back, and a refused Undo keeps it saved", async () => {
  const gone = setup({
    remove: async () => Promise.reject(apiError("not_found")),
  });
  await gone.flow.readText(vk1);
  if (gone.flow.step.name !== "check") throw new Error("no draft");
  await gone.flow.save(gone.flow.step.draft.initial);
  assert.ok((await gone.flow.undoSave()) !== undefined);
  assert.equal(gone.flow.step.name, "check");

  const kept = setup({
    remove: async () => Promise.reject(apiError("order_closed")),
  });
  await kept.flow.readText(vk1);
  if (kept.flow.step.name !== "check") throw new Error("no draft");
  await kept.flow.save(kept.flow.step.draft.initial);
  assert.equal(await kept.flow.undoSave(), undefined);
  const after = kept.flow.step;
  assert.equal(after.name, "saved");
  if (after.name === "saved") {
    assert.equal((after.error as { code: string }).code, "order_closed");
  }
});

test("start again goes back to the first step", async () => {
  const { flow } = setup();
  await flow.readText(vk1);
  flow.reset();
  assert.deepEqual(flow.step, {
    name: "input",
    error: undefined,
    retry: undefined,
  });
});

test("a refused file is told apart from a reading that failed", () => {
  assert.equal(isRefusedFile(apiError("cannot_decode")), true);
  assert.equal(isRefusedFile(apiError("unsupported_media_type")), true);
  assert.equal(isRefusedFile(apiError("speech_failed")), false);
  assert.equal(isRefusedFile(apiError("no_words")), false);
  assert.equal(isRefusedFile(undefined), false);
});
