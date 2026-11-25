import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cityCentre, cityKey } from "../../shared/cities.ts";
import { addDays, istDay } from "../../shared/day.ts";
import {
  maxPartBytes,
  maxPartSeconds,
  minPartSeconds,
  wavContentTypes,
} from "../../shared/reading.ts";
import {
  searchQuerySchema,
  type SearchAnswer,
  type SearchSort,
  type SearchSpeechAnswer,
} from "../../shared/search.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, errorResponse, type AppError } from "../http/errors.ts";
import { parseInput } from "../http/input.ts";
import { farDayError, pastDayError } from "../orders/order-errors.ts";
import { keyterms } from "../reading/menu.ts";
import { readWav } from "../reading/wav.ts";
import type { SarvamDeps, SarvamResult } from "../sarvam/call.ts";
import { speechToText, type Speech } from "../sarvam/speech-to-text.ts";
import { transliterate } from "../sarvam/transliterate.ts";
import { dayWindow } from "../stores/store-capacity.ts";
import { createCatalog, type Words } from "./catalog.ts";
import { searchForm, sourceLanguage } from "./search-form.ts";
import { createSearchIndex, trigramLength } from "./search-index.ts";

type SearchDeps = Pick<
  RouteDeps,
  "db" | "clock" | "config" | "log" | "metrics" | "flags" | "sarvam" | "limits"
>;

type SpeechFailure = Exclude<SarvamResult<Speech>, { ok: true }>;

export type LatinForm = (
  query: string,
  source: string,
  signal: AbortSignal,
) => Promise<string | null>;

const speechMessages: Record<SpeechFailure["outcome"], string> = {
  no_credit: "Voice search is not available now. Type the dish.",
  rate_limited:
    "Too many voice searches at once. Wait a minute, or type the dish.",
  timeout: "The voice search took too long. Try again, or type the dish.",
  invalid: "We could not hear a dish. Try again, or type it.",
  error: "We could not hear a dish. Try again, or type it.",
};

export function searchRoutes(deps: SearchDeps): Hono<AppEnv> {
  const { db, clock, config, flags, limits } = deps;
  const index = createSearchIndex(db);
  const catalog = createCatalog(db);
  const recorded = config.SARVAM_MODE === "recorded";
  const sarvamDeps = <E extends AppEnv>(c: Context<E>): SarvamDeps => ({
    sarvam: deps.sarvam,
    metrics: deps.metrics,
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
  const speechBody = bodyLimit({
    maxSize: maxPartBytes,
    onError: (c) =>
      errorResponse(
        c,
        413,
        "payload_too_large",
        "A voice search is 1 MB at most. Say the dish in a few seconds.",
      ),
  });

  return new Hono<AppEnv>()
    .get("/api/search", limits.searches, async (c) => {
      const query = parseInput(searchQuerySchema, c.req.query());
      const signal = c.req.raw.signal;
      const today = istDay(clock.now());
      const lastDay = addDays(today, dayWindow - 1);
      if (query.need_by !== undefined && query.need_by < today) {
        throw pastDayError();
      }
      if (query.need_by !== undefined && query.need_by > lastDay) {
        throw farDayError(lastDay);
      }
      const values = await flags.environment(signal);
      const latinForm: LatinForm = async (text, source, inner) => {
        const answer = await transliterate(
          sarvamDeps(c),
          { text, source, target: "en-IN" },
          inner,
        );
        return answer.ok ? answer.value : null;
      };
      const { words, latin } = await wordsFor(
        query.q,
        values.ops_search === "ai" ? latinForm : null,
        index,
        signal,
      );
      const buyer =
        query.lat === undefined || query.lng === undefined
          ? null
          : { lat: query.lat, lng: query.lng };
      const city = cityKey(query.city ?? "") || null;
      const sort: SearchSort =
        query.sort ?? (buyer === null ? "rating" : "distance");
      const centre =
        buyer === null && sort === "distance" && city !== null
          ? cityCentre(city)
          : null;
      const result = catalog.search({
        words,
        needBy: query.need_by ?? null,
        veg: query.veg ?? null,
        category: query.category ?? null,
        sort,
        origin: buyer ?? centre,
        city,
        today,
      });
      c.set("flagVariants", {
        ...c.get("flagVariants"),
        ops_search: values.ops_search,
        search_match: words.match,
      });
      const answer: SearchAnswer = {
        today,
        query: query.q,
        latin,
        match: words.match,
        need_by: query.need_by ?? null,
        need_by_met: result.needByMet,
        sort,
        located: buyer !== null,
        city,
        distance_from:
          buyer !== null ? "buyer" : centre !== null ? "centre" : null,
        stores: result.stores,
        voice: values.ops_voice,
        recorded,
      };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .post("/api/search/speech", limits.uploads, speechBody, async (c) => {
      const type = c.req.header("Content-Type")?.split(";")[0]?.trim() ?? "";
      if (!wavContentTypes.includes(type.toLowerCase())) {
        throw appError(
          415,
          "unsupported_media_type",
          "Send the voice search as a WAV file, with Content-Type: audio/wav.",
        );
      }
      const audio = new Uint8Array(await c.req.arrayBuffer());
      const wav = readWav(audio);
      if (
        wav === undefined ||
        wav.seconds < minPartSeconds ||
        wav.seconds > maxPartSeconds
      ) {
        throw appError(
          400,
          "audio_invalid",
          `This is not a WAV file of up to ${maxPartSeconds} seconds with sound. Say the dish again, or type it.`,
        );
      }
      const signal = c.req.raw.signal;
      const { ops_voice, cfg_sarvam } = await flags.environment(signal);
      c.set("flagVariants", {
        ...c.get("flagVariants"),
        ops_voice: ops_voice ? "on" : "off",
        speech_mode: cfg_sarvam.speech_mode,
      });
      if (!ops_voice) {
        throw appError(
          409,
          "voice_off",
          "Voice search is off for now. Type the dish.",
        );
      }
      const speech = await speechToText(
        sarvamDeps(c),
        {
          audio,
          seconds: wav.seconds,
          model: cfg_sarvam.speech_model,
          mode: cfg_sarvam.speech_mode,
          keyterms: keyterms(catalog.dishNames()),
        },
        signal,
      );
      if (!speech.ok) throw speechError(speech);
      const answer: SearchSpeechAnswer = {
        transcript: speech.value.transcript,
        language: speech.value.language,
        recorded,
        placeholder: speech.placeholder,
      };
      return c.json(answer);
    });
}

// How the words of a query are matched. A query in an Indian script gets
// its Latin form first; when that fails (or ops_search is plain), the
// original names are matched as they are.
export async function wordsFor(
  query: string,
  latinForm: LatinForm | null,
  index: Pick<
    ReturnType<typeof createSearchIndex>,
    "sync" | "trigram" | "prefix"
  >,
  signal: AbortSignal,
): Promise<{ words: Words; latin: string | null }> {
  if (query === "") return { words: { match: "all" }, latin: null };
  if (latinForm === null) {
    return { words: { match: "plain", text: query }, latin: null };
  }
  const source = sourceLanguage(query);
  const latin = source === null ? null : await latinForm(query, source, signal);
  if (source !== null && latin === null) {
    return { words: { match: "plain", text: query }, latin: null };
  }
  const form = searchForm(latin ?? query);
  if (form === "") return { words: { match: "plain", text: query }, latin };
  index.sync();
  return form.length >= trigramLength
    ? { words: { match: "trigram", hits: index.trigram(form) }, latin }
    : { words: { match: "prefix", hits: index.prefix(form) }, latin };
}

function speechError(failure: SpeechFailure): AppError {
  if (failure.missing) {
    return appError(
      422,
      "recording_missing",
      "Recorded mode has no saved answer for this voice search. Type the dish instead.",
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
