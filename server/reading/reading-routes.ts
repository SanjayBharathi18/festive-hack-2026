import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { addDays } from "../../shared/day.ts";
import {
  cartPartQuerySchema,
  cartReadBodySchema,
  deskReadBodySchema,
  itemReadBodySchema,
  maxPartBytes,
  maxPartSeconds,
  minPartSeconds,
  wavContentTypes,
  type ItemReadAnswer,
  type PartAnswer,
  type SellReadState,
} from "../../shared/reading.ts";
import type { RouteDeps } from "../app.ts";
import { checkDay, nextFreeDay, type Amount } from "../capacity/capacity.ts";
import type { Db } from "../db/database.ts";
import { flagVariants, type FlagValues } from "../flags/decisions.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, errorResponse, type AppError } from "../http/errors.ts";
import { parseInput, readJson } from "../http/input.ts";
import type { SarvamResult } from "../sarvam/call.ts";
import { speechToText, type Speech } from "../sarvam/speech-to-text.ts";
import { getMenu } from "../stores/menu.ts";
import { dayWindow, readCapacity } from "../stores/store-capacity.ts";
import {
  publishedStoreById,
  publishedStoreBySlug,
  type Store,
} from "../stores/store-data.ts";
import { deskAuth, type DeskEnv } from "../verify/desk-auth.ts";
import { createMemoryIdempotency } from "./memory-idempotency.ts";
import { keyterms } from "./menu.ts";
import {
  createPartStore,
  joinParts,
  partTtlMs,
  type Heard,
  type ReadKind,
} from "./parts.ts";
import {
  cartAnswer,
  deskAnswer,
  readItem,
  readOrder,
  type DayCapacityCheck,
  type ReadingDeps,
  type ReadRequest,
  type ReadResult,
} from "./pipeline.ts";
import { readWav } from "./wav.ts";

type ReadingRouteDeps = Pick<
  RouteDeps,
  "db" | "clock" | "config" | "log" | "metrics" | "flags" | "sarvam" | "limits"
>;

type SpeechFailure = Exclude<SarvamResult<Speech>, { ok: true }>;

type PartScope = { storeId: string; kind: ReadKind; keyterms: string[] };

export const readBodyBytes = 64 * 1024;

const storeOfBody = z.object({ store: z.string() });

const speechMessages: Record<SpeechFailure["outcome"], string> = {
  no_credit: "Voice orders are not available now. Type or paste the order.",
  rate_limited:
    "Too many voice notes at once. Try again in a minute, or type the order.",
  timeout:
    "The voice note took too long to read. Try again, or type the order.",
  invalid: "We could not read this voice note. Try again, or type the order.",
  error: "We could not read this voice note. Try again, or type the order.",
};

export function readingRoutes(deps: ReadingRouteDeps): Hono<AppEnv> {
  const { db, limits } = deps;
  const parts = createPartStore(deps.clock);
  const idempotent = createMemoryIdempotency(deps.clock, { ttlMs: partTtlMs });
  const deskKeys = idempotent<DeskEnv>((c) => c.get("desk").storeId);
  const cartPartKeys = idempotent<AppEnv>((c) => c.req.query("store") ?? "");
  const sellKeys = idempotent<AppEnv>(() => "sell");
  const cartReadKeys = idempotent<AppEnv>((_c, body) => {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(body));
      return storeOfBody.safeParse(value).data?.store ?? "";
    } catch {
      return "";
    }
  });
  const desk = deskAuth(deps);
  const partBody = bodyLimit({
    maxSize: maxPartBytes,
    onError: (c) =>
      errorResponse(
        c,
        413,
        "payload_too_large",
        "A voice part is 1 MB at most. Send parts of 29 seconds or less.",
      ),
  });
  const readBody = bodyLimit({
    maxSize: readBodyBytes,
    onError: (c) =>
      errorResponse(
        c,
        413,
        "payload_too_large",
        "The order is too long. Send 5,000 characters or less.",
      ),
  });

  const readingDeps = <E extends AppEnv>(c: Context<E>): ReadingDeps => ({
    sarvam: deps.sarvam,
    metrics: deps.metrics,
    flags: deps.flags,
    clock: deps.clock,
    report: (call) => {
      if (call.outcome === "ok") return;
      deps.log({
        request_id: c.get("requestId"),
        msg: "a Sarvam call failed",
        api: call.api,
        model: call.model,
        language: call.language,
        outcome: call.outcome,
        status: call.status,
        reason: call.reason,
      });
    },
  });

  const transcribe = async <E extends AppEnv>(
    c: Context<E>,
    { storeId, kind, keyterms }: PartScope,
  ): Promise<Response> => {
    const type = c.req.header("Content-Type")?.split(";")[0]?.trim() ?? "";
    if (!wavContentTypes.includes(type.toLowerCase())) {
      throw appError(
        415,
        "unsupported_media_type",
        "Send each part as a WAV file, with Content-Type: audio/wav.",
      );
    }
    const audio = new Uint8Array(await c.req.arrayBuffer());
    const wav = readWav(audio);
    if (wav === undefined || wav.seconds < minPartSeconds) {
      throw appError(
        400,
        "audio_invalid",
        "This part is not a WAV file with sound, or it is too short. Record the order again, or type it.",
      );
    }
    if (wav.seconds > maxPartSeconds) {
      throw appError(
        400,
        "audio_invalid",
        `A part is ${maxPartSeconds} seconds at most. Send parts of 29 seconds or less.`,
      );
    }
    const signal = c.req.raw.signal;
    const { ops_voice, cfg_sarvam } = await deps.flags.environment(signal);
    c.set("flagVariants", {
      ...c.get("flagVariants"),
      ops_voice: ops_voice ? "on" : "off",
      speech_mode: cfg_sarvam.speech_mode,
    });
    if (!ops_voice) {
      throw appError(
        409,
        "voice_off",
        "Voice orders are off for now. Type or paste the order.",
      );
    }
    const speech = await speechToText(
      readingDeps(c),
      {
        audio,
        seconds: wav.seconds,
        model: cfg_sarvam.speech_model,
        mode: cfg_sarvam.speech_mode,
        keyterms,
      },
      signal,
    );
    if (!speech.ok) throw speechError(speech);
    c.set("flagVariants", {
      ...c.get("flagVariants"),
      sarvam: answerSource(deps.sarvam.mode, speech.placeholder),
    });
    const part = parts.add({
      storeId,
      kind,
      ...speech.value,
      seconds: wav.seconds,
      placeholder: speech.placeholder,
    });
    const answer: PartAnswer = {
      part_id: part.id,
      transcript: part.transcript,
      language: part.language,
      language_probability: part.probability,
      seconds: Math.round(part.seconds * 100) / 100,
      recorded: deps.sarvam.mode === "recorded",
      placeholder: part.placeholder,
    };
    return c.json(answer, 201);
  };

  const read = async <E extends AppEnv>(
    c: Context<E>,
    store: Store,
    request: Omit<ReadRequest, "store" | "menu">,
  ): Promise<ReadResult> => {
    if (request.heard.transcript.trim() === "") {
      throw appError(
        422,
        "no_words",
        "We heard no words in this voice note. Record it again close to the phone, or type the order.",
      );
    }
    const result = await readOrder(
      readingDeps(c),
      {
        ...request,
        store: { slug: store.slug, is_demo: store.is_demo },
        menu: getMenu(db, store.id),
      },
      c.req.raw.signal,
    );
    c.set("flagVariants", {
      ...flagVariants(result.decision),
      sarvam: answerSource(deps.sarvam.mode, result.placeholder),
    });
    return result;
  };

  // Seller setup reads items with no account, so its parts belong to no
  // store. ops_suggestions off leaves the item form only: no voice parts,
  // and a reading on the manual path.
  const itemScope: PartScope = { storeId: "", kind: "item", keyterms: [] };
  const itemFlags = async <E extends AppEnv>(
    c: Context<E>,
  ): Promise<FlagValues> => {
    const values = await deps.flags.environment(c.req.raw.signal);
    c.set("flagVariants", {
      ...c.get("flagVariants"),
      ops_suggestions: values.ops_suggestions,
    });
    return values;
  };

  return new Hono<AppEnv>()
    .post(
      "/api/desk/read/parts",
      limits.uploads,
      desk,
      partBody,
      deskKeys,
      (c) =>
        cancellable(c, async () => {
          const store = publishedStoreById(db, c.get("desk").storeId);
          if (store === undefined) throw storeMissing();
          return transcribe(c, storeScope(db, store, "desk"));
        }),
    )
    .post("/api/desk/read", limits.readings, desk, readBody, deskKeys, (c) =>
      cancellable(c, async () => {
        const body = await readJson(c, deskReadBodySchema);
        const store = publishedStoreById(db, c.get("desk").storeId);
        if (store === undefined) throw storeMissing();
        const found =
          body.part_ids === undefined
            ? undefined
            : parts.find(body.part_ids, { storeId: store.id, kind: "desk" });
        if (body.part_ids !== undefined && found === undefined) {
          throw partsExpired();
        }
        const heard: Heard =
          found === undefined
            ? {
                transcript: body.text ?? "",
                language: null,
                placeholder: false,
              }
            : joinParts(found);
        const result = await read(c, store, {
          kind: "desk",
          source: body.source,
          heard: { ...heard, language: body.language ?? heard.language },
          identify: found === undefined && body.language === undefined,
          checkDay: capacityCheck(db, store),
        });
        return c.json(deskAnswer(result));
      }),
    )
    .post("/api/cart/read/parts", limits.uploads, partBody, cartPartKeys, (c) =>
      cancellable(c, async () => {
        const { store: slug } = parseInput(cartPartQuerySchema, c.req.query());
        const store = publishedStoreBySlug(db, slug);
        if (store === undefined) throw storeMissing();
        return transcribe(c, storeScope(db, store, "cart"));
      }),
    )
    .post("/api/cart/read", limits.readings, readBody, cartReadKeys, (c) =>
      cancellable(c, async () => {
        const body = await readJson(c, cartReadBodySchema);
        const store = publishedStoreBySlug(db, body.store);
        if (store === undefined) throw storeMissing();
        const found = parts.find(body.part_ids, {
          storeId: store.id,
          kind: "cart",
        });
        if (found === undefined) throw partsExpired();
        const result = await read(c, store, {
          kind: "cart",
          source: body.via === "market" ? "marketplace" : "link",
          heard: joinParts(found),
          identify: false,
        });
        return c.json(cartAnswer(result));
      }),
    )
    .get("/api/sell/read", async (c) => {
      const values = await deps.flags.environment(c.req.raw.signal);
      c.set("flagVariants", {
        ops_suggestions: values.ops_suggestions,
        ops_voice: values.ops_voice ? "on" : "off",
      });
      c.header("Cache-Control", "no-store");
      const state: SellReadState = {
        reading: values.ops_suggestions === "ai",
        voice: values.ops_voice,
        recorded: deps.sarvam.mode === "recorded",
      };
      return c.json(state);
    })
    .post("/api/sell/read/parts", limits.uploads, partBody, sellKeys, (c) =>
      cancellable(c, async () => {
        const { ops_suggestions } = await itemFlags(c);
        if (ops_suggestions === "off") {
          throw appError(
            409,
            "voice_off",
            "Item reading is off for now. Fill in the item form.",
          );
        }
        return transcribe(c, itemScope);
      }),
    )
    .post("/api/sell/items/read", limits.readings, readBody, sellKeys, (c) =>
      cancellable(c, async () => {
        const flags = await itemFlags(c);
        const body = await readJson(c, itemReadBodySchema);
        const found =
          body.part_ids === undefined
            ? undefined
            : parts.find(body.part_ids, itemScope);
        if (body.part_ids !== undefined && found === undefined) {
          throw partsExpired();
        }
        const heard: Heard =
          found === undefined
            ? {
                transcript: body.text ?? "",
                language: null,
                placeholder: false,
              }
            : joinParts(found);
        if (heard.transcript.trim() === "") {
          throw appError(
            422,
            "no_words",
            "We heard no words in this voice note. Record the item again close to the microphone, or type it.",
          );
        }
        const { missing, ...answer } = await readItem(
          readingDeps(c),
          { heard, flags },
          c.req.raw.signal,
        );
        c.set("flagVariants", {
          ...c.get("flagVariants"),
          ops_reading: answer.path,
          sarvam: answerSource(deps.sarvam.mode, answer.placeholder),
        });
        if (missing) {
          throw appError(
            422,
            "recording_missing",
            "Recorded mode has no saved answer for this item. Fill in the item form instead.",
          );
        }
        return c.json(answer satisfies ItemReadAnswer);
      }),
    );
}

function storeScope(db: Db, store: Store, kind: ReadKind): PartScope {
  return { storeId: store.id, kind, keyterms: keyterms(getMenu(db, store.id)) };
}

function capacityCheck(db: Db, store: Store): DayCapacityCheck {
  return (day, items) => {
    const until = addDays(day, dayWindow);
    const { rules, loads } = readCapacity(db, store, day, until);
    const cart: Amount[] = items
      .filter((item) => !item.sold_out)
      .flatMap((item) =>
        item.packs.map(({ quantity, grams, pieces }) => ({
          quantity,
          grams,
          pieces,
        })),
      );
    const check = checkDay(rules, loads, cart, day);
    return {
      ...check,
      next_free_day: check.fits
        ? null
        : nextFreeDay(rules, loads, cart, addDays(day, 1), until),
    };
  };
}

async function cancellable<E extends AppEnv>(
  c: Context<E>,
  work: () => Promise<Response>,
): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
    throw error;
  }
}

function answerSource(mode: "live" | "recorded", placeholder: boolean): string {
  return placeholder ? "placeholder" : mode;
}

function speechError(failure: SpeechFailure): AppError {
  if (failure.missing) {
    return appError(
      422,
      "recording_missing",
      "Recorded mode has no saved answer for this voice note. Type or paste the order instead.",
    );
  }
  const status =
    failure.outcome === "timeout"
      ? 504
      : failure.outcome === "rate_limited" || failure.outcome === "no_credit"
        ? 503
        : 502;
  return appError(status, "speech_failed", speechMessages[failure.outcome]);
}

function storeMissing(): AppError {
  return appError(
    404,
    "not_found",
    "This store is not on the app. Check the link.",
  );
}

function partsExpired(): AppError {
  return appError(
    410,
    "parts_expired",
    "These voice parts have expired. Send the voice note again.",
  );
}
