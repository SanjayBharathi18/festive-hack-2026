import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { addDays, istDay } from "../../shared/day.ts";
import { toSarvamLanguage } from "../../shared/languages.ts";
import type { Fulfilment } from "../../shared/model.ts";
import {
  checkoutBodySchema,
  type CheckoutAnswer,
} from "../../shared/orders.ts";
import { storeQuerySchema } from "../../shared/store.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { readJson } from "../http/input.ts";
import { createMessenger } from "../messages/sender.ts";
import { createSweep } from "../payments/expiry.ts";
import { createPayments } from "../payments/payment-data.ts";
import { getMenu } from "../stores/menu.ts";
import { dayWindow } from "../stores/store-capacity.ts";
import { publishedStoreById, type Store } from "../stores/store-data.ts";
import { createSessions } from "../verify/sessions.ts";
import { menuOffers, priceCart } from "./cart.ts";
import { daySpace } from "./day-space.ts";
import { createNotify, dishOf } from "./notify.ts";
import { createOrderData, newToken } from "./order-data.ts";
import {
  cartError,
  dayError,
  farDayError,
  pastDayError,
} from "./order-errors.ts";
import { orderPage } from "./order-view.ts";

type CheckoutDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "log"
  | "metrics"
  | "events"
  | "idempotent"
  | "translator"
  | "flags"
>;

const noteWaitMs = 1_500;

export function checkoutRoutes({
  db,
  clock,
  config,
  log,
  metrics,
  events,
  idempotent,
  translator,
  flags,
}: CheckoutDeps): Hono<AppEnv> {
  const publicUrl = config.PUBLIC_URL;
  const orders = createOrderData(db);
  const sessions = createSessions({ db, clock, secret: config.SESSION_SECRET });
  const messenger = createMessenger({ db, clock, publicUrl });
  const notify = createNotify({
    messenger,
    events,
    log,
    publicUrl,
    translator,
  });
  const payments = createPayments(db);
  const sweepUnpaid = createSweep({ db, clock, orders, notify, log });

  return new Hono<AppEnv>()
    .post("/api/orders", idempotent, async (c) => {
      const body = await readJson(c, checkoutBodySchema);
      const proof = sessions.find("order", body.proof);
      if (proof === undefined) throw proofError();
      const store = publishedStoreById(db, body.store_id);
      if (store === undefined) {
        throw appError(
          404,
          "not_found",
          "This store is not on the app. Check the link.",
        );
      }
      checkTakingOrders(store, body.fulfilment);
      const today = istDay(clock.now());
      const lastDay = addDays(today, dayWindow - 1);
      if (body.day < today) throw pastDayError();
      if (body.day > lastDay) throw farDayError(lastDay);
      const source = body.via === "market" ? "marketplace" : "link";
      const paymentRequired =
        source === "marketplace" &&
        store.accepts_online &&
        store.advance_for_strangers;
      sweepUnpaid();
      const order = db.transaction(() => {
        const priced = priceCart(menuOffers(getMenu(db, store.id)), body.cart, {
          checkPrices: true,
          allowSoldOut: false,
        });
        if (!priced.ok) throw cartError(priced.problem);
        const warning = daySpace(db, store, body.day, priced.lines);
        if (warning !== null) throw dayError(warning);
        if (!sessions.close("order", body.proof)) throw proofError();
        const id = randomUUID();
        orders.insert(
          {
            id,
            storeId: store.id,
            token: newToken(),
            source,
            status: paymentRequired ? "awaiting_payment" : "new",
            fulfilment: body.fulfilment,
            day: body.day,
            address: body.fulfilment === "delivery" ? body.address : null,
            giftName: body.gift?.name ?? null,
            giftPhone: body.gift?.phone ?? null,
            giftMessage: body.gift?.message ?? null,
            note: body.note,
            buyerName: body.buyer_name,
            buyerPhone: proof.subject,
            buyerLanguage: body.buyer_language,
            total: priced.total,
            paymentRequired,
            transcript: null,
            readingLanguage: null,
            readingVariant: null,
            edited: false,
            createdAt: clock.now(),
          },
          priced.lines,
        );
        return orders.byId(store.id, id);
      })();
      if (order === undefined) throw new Error("The new order was not saved.");
      // The message names the dishes in the buyer's script, so the names
      // wait with the note, at most noteWaitMs.
      const [, names] = await Promise.all([
        translator.translate(order.note, order.store.sellerLanguage, {
          signal: c.req.raw.signal,
          waitMs: noteWaitMs,
        }),
        translator.scriptNames(order.lines.map(dishOf), body.buyer_language, {
          signal: c.req.raw.signal,
          waitMs: noteWaitMs,
        }),
      ]);
      notify.created(order, paymentRequired ? null : "order_placed");
      metrics.ordersCreated.inc({
        source,
        language: toSarvamLanguage(body.buyer_language),
        variant: "none",
        edited: "none",
      });
      const answer: CheckoutAnswer = {
        token: order.token,
        order: orderPage(
          order,
          messenger.log(order.id),
          payments.view(order),
          names,
        ),
      };
      return c.json(answer, 201);
    })
    .get("/api/orders/:token", async (c) => {
      sweepUnpaid();
      const order = orders.byToken(c.req.param("token"));
      if (order === undefined) {
        throw appError(
          404,
          "not_found",
          "No order has this link. Check the link in your message.",
        );
      }
      const lang = storeQuerySchema.safeParse(c.req.query()).data?.lang;
      let names = new Map<string, string>();
      if (lang !== undefined) {
        const signal = c.req.raw.signal;
        const values = await flags.environment(signal);
        c.set("flagVariants", {
          ...c.get("flagVariants"),
          ops_transliteration: values.ops_transliteration,
        });
        names = await translator.scriptNames(order.lines.map(dishOf), lang, {
          signal,
        });
      }
      c.header("Cache-Control", "no-store");
      return c.json(
        orderPage(order, messenger.log(order.id), payments.view(order), names),
      );
    });
}

function checkTakingOrders(store: Store, fulfilment: Fulfilment): void {
  if (store.paused || !store.normal_orders_on) {
    throw appError(
      409,
      "store_not_taking_orders",
      `${store.name} is not taking orders now.`,
    );
  }
  if (fulfilment === "pickup" && !store.offers_pickup) {
    throw appError(
      409,
      "fulfilment_unavailable",
      `${store.name} does not offer pickup. Choose delivery.`,
    );
  }
  if (fulfilment === "delivery" && !store.offers_delivery) {
    throw appError(
      409,
      "fulfilment_unavailable",
      `${store.name} does not deliver. Choose pickup.`,
    );
  }
}

function proofError(): AppError {
  return appError(
    401,
    "proof_invalid",
    "Verify your WhatsApp number again: ask for a new code.",
  );
}
