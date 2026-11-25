import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { istDay } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import {
  quoteBodySchema,
  type DeskQuote,
  type DeskQuotes,
  type QuoteAnswer,
  type QuotePayload,
} from "../../shared/quotes.ts";
import type { RouteDeps } from "../app.ts";
import { boardPost, createBoardData } from "../bulk/board-data.ts";
import { bulkItemsByStore } from "../bulk/bulk-data.ts";
import { bookedDates, packageOf } from "../catering/package-data.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { readJson } from "../http/input.ts";
import { publishedStoreById, type Store } from "../stores/store-data.ts";
import { createTranslator, type Translator } from "../translate/translator.ts";
import { deskAuth } from "../verify/desk-auth.ts";
import { createSessions } from "../verify/sessions.ts";
import {
  boardPostPayload,
  bulkPayload,
  cateringPayload,
  type BoardPostInput,
  type BulkInput,
  type CateringInput,
} from "./quote-build.ts";
import { createQuoteData, type QuoteRow } from "./quote-data.ts";

type QuoteDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "metrics"
  | "idempotent"
  | "flags"
  | "sarvam"
  | "log"
  | "stopping"
  | "events"
>;

// Contact seller: a verified request for a bulk cart, a catering plan or a
// board post answer, and her list of requests on the desk.
export function quoteRoutes(deps: QuoteDeps): Hono<AppEnv> {
  const { db, clock, config, metrics, idempotent, events } = deps;
  const sessions = createSessions({ db, clock, secret: config.SESSION_SECRET });
  const quotes = createQuoteData(db);
  const boards = createBoardData(db);
  const translator = createTranslator(deps);
  const sellerOf = db.prepare(
    "SELECT phone, language FROM sellers WHERE id = ?",
  );
  const today = () => istDay(clock.now());

  const build = (
    store: Store,
    request: BulkInput | CateringInput | BoardPostInput,
  ): QuotePayload => {
    switch (request.kind) {
      case "bulk": {
        if (!store.bulk_on) throw notTaking(store, "bulk");
        const items = bulkItemsByStore(db, [store.id]).get(store.id) ?? [];
        return bulkPayload(items, request, today());
      }
      case "catering": {
        if (!store.catering_on) throw notTaking(store, "catering");
        const pkg = packageOf(db, store.id, request.package_id);
        if (pkg === undefined) {
          throw appError(
            404,
            "not_found",
            "This package is no longer offered. Choose another package.",
          );
        }
        return cateringPayload(pkg, request, {
          today: today(),
          booked: new Set(bookedDates(db, store.id, today())),
        });
      }
      case "board_post": {
        const row = boards.byToken(request.board_post);
        if (row === undefined) {
          throw appError(
            404,
            "not_found",
            "No board post has this link. Check the link.",
          );
        }
        const post = boardPost(row, today());
        return boardPostPayload(
          post,
          boards.interestOf(post.id, store.id),
          request,
        );
      }
    }
  };

  return new Hono<AppEnv>()
    .post("/api/quotes", idempotent, async (c) => {
      const body = await readJson(c, quoteBodySchema);
      const proof = sessions.find("order", body.proof);
      if (proof === undefined) throw proofError();
      const store = publishedStoreById(db, body.request.store_id);
      if (store === undefined) {
        throw appError(
          404,
          "not_found",
          "This store is not on the app. Check the link.",
        );
      }
      const payload = build(store, body.request);
      const quote: QuoteRow = {
        id: randomUUID(),
        storeId: store.id,
        kind: payload.kind,
        payload,
        buyerName: body.buyer_name,
        buyerPhone: proof.subject,
        language: body.language,
        createdAt: clock.now(),
      };
      db.transaction(() => {
        if (!sessions.close("order", body.proof)) throw proofError();
        quotes.insert(quote);
      })();
      metrics.quoteRequests.inc({ kind: quote.kind });
      events.publish(store.id, { type: "quote_created", quote_id: quote.id });
      const seller = sellerOf.get(store.seller_id) as { phone: string };
      const answer: QuoteAnswer = {
        id: quote.id,
        store: { slug: store.slug, name: store.name },
        seller_phone: seller.phone,
        request: payload,
        created_at: quote.createdAt,
      };
      return c.json(answer, 201);
    })
    .get("/api/desk/quotes", deskAuth(deps), async (c) => {
      const desk = c.get("desk");
      const seller = sellerOf.get(desk.sellerId) as {
        language: AppLanguage;
      };
      const signal = c.req.raw.signal;
      const answer: DeskQuotes = {
        quotes: await Promise.all(
          quotes
            .list(desk.storeId)
            .map((quote) =>
              deskQuote(translator, quote, seller.language, signal),
            ),
        ),
      };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    });
}

async function deskQuote(
  translator: Translator,
  quote: QuoteRow,
  language: AppLanguage,
  signal: AbortSignal,
): Promise<DeskQuote> {
  const { payload } = quote;
  const options = { from: quote.language, signal };
  const [note, place, company] = await Promise.all([
    translator.translate(payload.note, language, options),
    translator.translate(placeOf(payload), language, options),
    translator.translate(
      payload.kind === "board_post" ? payload.company : null,
      language,
      options,
    ),
  ]);
  return {
    id: quote.id,
    kind: quote.kind,
    created_at: quote.createdAt,
    buyer: {
      name: quote.buyerName,
      phone: quote.buyerPhone,
      language: quote.language,
    },
    request: payload,
    note_translation: note,
    place_translation: place,
    company_translation: company,
  };
}

function placeOf(payload: QuotePayload): string | null {
  switch (payload.kind) {
    case "bulk":
      return payload.place;
    case "catering":
      return payload.event.place;
    case "board_post":
      return payload.places.join("; ");
  }
}

function notTaking(store: Store, kind: "bulk" | "catering"): AppError {
  return appError(
    409,
    "store_not_taking_orders",
    kind === "bulk"
      ? `${store.name} takes no bulk orders now. Choose another store.`
      : `${store.name} takes no catering now. Choose another caterer.`,
  );
}

function proofError(): AppError {
  return appError(
    401,
    "proof_invalid",
    "Verify your WhatsApp number again: ask for a new code.",
  );
}
