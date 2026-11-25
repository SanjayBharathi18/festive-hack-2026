import { randomUUID } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { addDays, istDay, type Day } from "../../shared/day.ts";
import type { DeskSession, DeskStore } from "../../shared/desk.ts";
import {
  toAppLanguage,
  toSarvamLanguage,
  type AppLanguage,
} from "../../shared/languages.ts";
import {
  deskDayCheckBodySchema,
  deskOrderBodySchema,
  deskOrderPatchSchema,
  deskRangeSchema,
  undoWindowMs,
  type DailyList,
  type DeskBoard,
  type DeskOrderAnswer,
} from "../../shared/orders.ts";
import type { RouteDeps } from "../app.ts";
import { addsLoad, cartLoad } from "../capacity/capacity.ts";
import { heroSlug } from "../demo/seed.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, isAppError } from "../http/errors.ts";
import { parseInput, readJson } from "../http/input.ts";
import { createMessenger } from "../messages/sender.ts";
import { closedDatesFrom } from "../stores/desk-stock.ts";
import { getMenu } from "../stores/menu.ts";
import { dayWindow, readCapacity } from "../stores/store-capacity.ts";
import { publishedStoreById, type Store } from "../stores/store-data.ts";
import { deskAuth, type DeskEnv } from "../verify/desk-auth.ts";
import { createAfterUndo } from "./after-undo.ts";
import { keptOffers, menuOffers, priceCart } from "./cart.ts";
import { itemTotals, moneyTotals, spaceLeft } from "./daily.ts";
import { sellerDaySpace } from "./day-space.ts";
import { createNotify } from "./notify.ts";
import { createOrderData, newToken, type OrderRecord } from "./order-data.ts";
import { cartError, pastDayError } from "./order-errors.ts";
import { createOrderPatch } from "./order-patch.ts";
import { createReadyMessages } from "./ready-messages.ts";

type DeskDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "log"
  | "metrics"
  | "events"
  | "flags"
  | "idempotent"
  | "stopping"
  | "translator"
>;

const maxRangeDays = 92;
// Undo shows for the undo window after a save; a slow network gets a little
// more before the server keeps the order for good.
const takeBackMs = undoWindowMs + 5_000;

export function deskOrderRoutes(deps: DeskDeps): Hono<AppEnv> {
  const {
    db,
    clock,
    config,
    log,
    metrics,
    events,
    flags,
    idempotent,
    stopping,
    translator,
  } = deps;
  const publicUrl = config.PUBLIC_URL;
  const auth = deskAuth(deps);
  const orders = createOrderData(db);
  const messenger = createMessenger({ db, clock, publicUrl });
  const notify = createNotify({
    messenger,
    events,
    log,
    publicUrl,
    translator,
  });
  const sellerLanguage = db
    .prepare("SELECT language FROM sellers WHERE id = ?")
    .pluck();
  const today = () => istDay(clock.now());
  const storeOf = (storeId: string): Store => {
    const store = publishedStoreById(db, storeId);
    if (store === undefined) {
      throw appError(404, "not_found", "Your store is not on the app yet.");
    }
    return store;
  };
  const patchOrder = createOrderPatch({ db, clock, orders });
  const readyMessages = createReadyMessages({
    stopping,
    orders,
    messenger,
    notify,
    log,
  });
  // The experiment counts a saved reading only when its save was not undone.
  const conversions = createAfterUndo<undefined>({
    stopping,
    run: (orderId) => flags.recordConversion(orderId),
  });
  // The desk asks whether she is signed in, with no error when she is not.
  const session: MiddlewareHandler<DeskEnv> = async (c, next) => {
    try {
      await auth(c, next);
    } catch (error) {
      if (!isAppError(error) || error.code !== "not_signed_in") throw error;
      const answer: DeskSession = { signed_in: false };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    }
  };

  return new Hono<AppEnv>()
    .get("/api/desk/session", session, (c) => {
      const answer: DeskSession = { signed_in: true };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .get("/api/desk/store", auth, async (c) => {
      const desk = c.get("desk");
      const store = storeOf(desk.storeId);
      const values = await flags.environment(c.req.raw.signal);
      c.set("flagVariants", {
        ...c.get("flagVariants"),
        ops_voice: values.ops_voice ? "on" : "off",
      });
      const answer: DeskStore = {
        store: {
          id: store.id,
          slug: store.slug,
          name: store.name,
          area: store.area,
          city: store.city,
          is_demo: store.is_demo,
          limit_unit: store.limit_unit,
          daily_limit: store.daily_limit,
          offers_pickup: store.offers_pickup,
          offers_delivery: store.offers_delivery,
          paused: store.paused,
          bulk_on: store.bulk_on,
          catering_on: store.catering_on,
          normal_orders_on: store.normal_orders_on,
        },
        voice_samples: store.is_demo && store.slug === heroSlug,
        seller_language: sellerLanguage.get(desk.sellerId) as AppLanguage,
        menu: getMenu(db, store.id),
        closed_dates: closedDatesFrom(db, store.id, today()),
        flags: { ops_voice: values.ops_voice },
        recorded: config.SARVAM_MODE === "recorded",
      };
      c.header("Cache-Control", "no-store");
      return c.json(answer);
    })
    .get("/api/desk/orders", auth, (c) => {
      const store = storeOf(c.get("desk").storeId);
      const { from, to } = dayRange(c.req.query(), today());
      const list = orders.list(store.id, from, to, true);
      const first = list[0]?.day ?? from;
      const { loads } = readCapacity(
        db,
        store,
        first < from ? first : from,
        to,
      );
      const board: DeskBoard = {
        today: today(),
        limit_unit: store.limit_unit,
        daily_limit: store.daily_limit,
        days: [...Map.groupBy(list, (order) => order.day)].map(
          ([day, dayOrders]) => {
            const load = loads.get(day) ?? 0;
            return {
              day,
              load,
              space_left: spaceLeft(store.daily_limit, load),
              slips: dayOrders.map(notify.slip),
            };
          },
        ),
      };
      return c.json(board);
    })
    .post("/api/desk/orders", auth, idempotent, async (c) => {
      const desk = c.get("desk");
      const body = await readJson(c, deskOrderBodySchema);
      const store = storeOf(desk.storeId);
      if (body.day < today()) throw pastDayError();
      const { reading } = body;
      const id = reading?.order_id ?? randomUUID();
      const buyerLanguage: AppLanguage =
        body.buyer_language ??
        (reading?.language ? toAppLanguage(reading.language) : undefined) ??
        (sellerLanguage.get(desk.sellerId) as AppLanguage);
      const { order, warning } = db.transaction(() => {
        if (orders.exists(id)) {
          throw appError(
            409,
            "order_exists",
            "This order is already saved. Find it on the order board.",
          );
        }
        const priced = priceCart(menuOffers(getMenu(db, store.id)), body.cart, {
          checkPrices: false,
          allowSoldOut: true,
        });
        if (!priced.ok) throw cartError(priced.problem);
        const warning = sellerDaySpace(db, store, body.day, priced.lines);
        orders.insert(
          {
            id,
            storeId: store.id,
            token: newToken(),
            source: body.source,
            status: "new",
            fulfilment: body.fulfilment,
            day: body.day,
            address: body.fulfilment === "delivery" ? body.address : null,
            giftName: null,
            giftPhone: null,
            giftMessage: null,
            note: body.note,
            buyerName: body.buyer_name,
            buyerPhone: body.buyer_phone,
            buyerLanguage,
            total: priced.total,
            paymentRequired: false,
            transcript: reading?.transcript ?? null,
            readingLanguage: reading?.language ?? null,
            readingVariant: reading?.variant ?? null,
            edited: reading?.edited ?? false,
            createdAt: clock.now(),
          },
          priced.lines,
        );
        return { order: orders.byId(store.id, id), warning };
      })();
      if (order === undefined) throw new Error("The new order was not saved.");
      if (reading !== null) {
        c.set("flagVariants", {
          ...c.get("flagVariants"),
          reading_variant: reading.variant ?? "none",
        });
        if (!reading.edited && body.source === "desk") {
          conversions.schedule(id, undefined);
        }
      }
      metrics.ordersCreated.inc({
        source: body.source,
        language: reading?.language ?? toSarvamLanguage(buyerLanguage),
        variant: reading?.variant ?? "none",
        edited: reading === null ? "none" : String(reading.edited),
      });
      const answer: DeskOrderAnswer = {
        order: notify.created(order, null),
        warning,
      };
      return c.json(answer, 201);
    })
    .delete("/api/desk/orders/:id", auth, (c) => {
      const desk = c.get("desk");
      const order = orders.byId(desk.storeId, c.req.param("id"));
      if (order === undefined) {
        throw appError(404, "not_found", "This order is not on your desk.");
      }
      if (!canTakeBack(order, clock.now())) {
        throw appError(
          409,
          "order_closed",
          "This order can no longer be taken back. Cancel it on the board instead.",
        );
      }
      orders.remove(order.id);
      conversions.cancel(order.id);
      events.publish(order.storeId, {
        type: "order_removed",
        order_id: order.id,
      });
      return c.json({ removed: order.id });
    })
    .post("/api/desk/orders/:id/day-check", auth, async (c) => {
      const desk = c.get("desk");
      const body = await readJson(c, deskDayCheckBodySchema);
      const order = orders.byId(desk.storeId, c.req.param("id"));
      if (order === undefined) {
        throw appError(404, "not_found", "This order is not on your desk.");
      }
      const store = storeOf(desk.storeId);
      const priced = priceCart(
        keptOffers(getMenu(db, store.id), order.lines),
        body.cart,
        { checkPrices: false, allowSoldOut: true },
      );
      if (!priced.ok) throw cartError(priced.problem);
      // Only a change that adds to a day can break its limit.
      const adds =
        body.day !== order.day ||
        cartLoad(store.limit_unit, priced.lines) >
          cartLoad(store.limit_unit, order.lines);
      return c.json({
        warning: adds
          ? sellerDaySpace(db, store, body.day, priced.lines, order.id)
          : null,
      });
    })
    .patch("/api/desk/orders/:id", auth, async (c) => {
      const desk = c.get("desk");
      const patch = await readJson(c, deskOrderPatchSchema);
      const order = orders.byId(desk.storeId, c.req.param("id"));
      if (order === undefined) {
        throw appError(404, "not_found", "This order is not on your desk.");
      }
      const store = storeOf(desk.storeId);
      const { changed, template, warning } = db.transaction(() =>
        patchOrder(store, order, patch),
      )();
      const fresh = orders.byId(desk.storeId, order.id) ?? order;
      if (fresh.status === "ready" && order.status !== "ready") {
        readyMessages.schedule(fresh.storeId, fresh.id);
      }
      if (order.status === "ready" && fresh.status !== "ready") {
        readyMessages.cancel(fresh.id);
      }
      const answer: DeskOrderAnswer = {
        order: changed ? notify.changed(fresh, template) : notify.slip(fresh),
        warning,
      };
      return c.json(answer);
    })
    .get("/api/desk/daily", auth, (c) => {
      const store = storeOf(c.get("desk").storeId);
      const day = today();
      const { from, to } = dayRange(c.req.query(), day);
      const active = orders
        .list(store.id, from, to)
        .filter((order) => addsLoad(order.status));
      const { rules, loads } = readCapacity(db, store, from, to);
      const monthStart = addDays(day, -29);
      const daily: DailyList = {
        today: day,
        limit_unit: store.limit_unit,
        daily_limit: store.daily_limit,
        days: [...Map.groupBy(active, (order) => order.day)].map(
          ([day, dayOrders]) => {
            const load = loads.get(day) ?? 0;
            return {
              day,
              load,
              space_left: spaceLeft(store.daily_limit, load),
              closed: rules.closed_dates.has(day),
              ...moneyTotals(dayOrders),
              items: itemTotals(dayOrders),
            };
          },
        ),
        last_30_days: {
          from: monthStart,
          to: day,
          ...moneyTotals(orders.money(store.id, monthStart, day)),
        },
      };
      return c.json(daily);
    });
}

function dayRange(
  query: Record<string, string>,
  today: Day,
): { from: Day; to: Day } {
  const range = parseInput(deskRangeSchema, query);
  const from = range.from ?? today;
  const to = range.to ?? addDays(from, dayWindow);
  if (to < from || to > addDays(from, maxRangeDays)) {
    throw appError(
      400,
      "invalid_input",
      `Check these fields: to. Ask for ${maxRangeDays} days or fewer, from a day to a later day.`,
    );
  }
  return { from, to };
}

// Undo takes back only a desk order that she saved a moment ago and that has
// not changed since: no stamp, no payment, no refund.
function canTakeBack(order: OrderRecord, now: number): boolean {
  return (
    order.source === "desk" &&
    order.status === "new" &&
    !order.paid &&
    order.refund === null &&
    now - order.createdAt <= takeBackMs
  );
}
