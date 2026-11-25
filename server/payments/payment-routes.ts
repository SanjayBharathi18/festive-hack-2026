import { Hono } from "hono";
import type { DeskOrderAnswer } from "../../shared/orders.ts";
import {
  mockResultSchema,
  type PaymentResultAnswer,
  type PaymentStartAnswer,
} from "../../shared/payments.ts";
import type { RouteDeps } from "../app.ts";
import type { AppEnv } from "../http/context.ts";
import { appError, type AppError } from "../http/errors.ts";
import { parseInput } from "../http/input.ts";
import { createMessenger } from "../messages/sender.ts";
import { createNotify } from "../orders/notify.ts";
import { createOrderData, type OrderRecord } from "../orders/order-data.ts";
import { orderPage } from "../orders/order-view.ts";
import { deskAuth } from "../verify/desk-auth.ts";
import { createSweep, startPaymentExpiry } from "./expiry.ts";
import { markPaid } from "./mark-paid.ts";
import { createPayments } from "./payment-data.ts";

type PaymentDeps = Pick<
  RouteDeps,
  | "db"
  | "clock"
  | "config"
  | "log"
  | "events"
  | "idempotent"
  | "stopping"
  | "translator"
>;

// Simulated payments (docs/system.md, "Payments"): the order page starts a
// payment, the prototype screen /pay/:token answers Pay or Fail, and the
// seller refunds a paid order from her desk.
export function paymentRoutes(deps: PaymentDeps): Hono<AppEnv> {
  const { db, clock, config, log, events, idempotent, stopping, translator } =
    deps;
  const publicUrl = config.PUBLIC_URL;
  const orders = createOrderData(db);
  const payments = createPayments(db);
  const messenger = createMessenger({ db, clock, publicUrl });
  const notify = createNotify({
    messenger,
    events,
    log,
    publicUrl,
    translator,
  });
  const auth = deskAuth(deps);
  const sweep = createSweep({ db, clock, orders, notify, log });
  startPaymentExpiry({ stopping, sweep });

  const buyerOrder = (token: string): OrderRecord => {
    sweep();
    const order = orders.byToken(token);
    if (order === undefined) {
      throw appError(
        404,
        "not_found",
        "No order has this link. Check the link in your message.",
      );
    }
    if (!payments.view(order).online) {
      throw appError(
        403,
        "forbidden",
        `${order.store.name} does not take online payments. Pay her in cash.`,
      );
    }
    return order;
  };
  const page = (order: OrderRecord) =>
    orderPage(order, messenger.log(order.id), payments.view(order));
  // A payment that went through and was not refunded counts, even on an
  // order that the desk marked unpaid before it refused that, so no buyer
  // pays twice and the payment can still be refunded.
  const settled = (order: OrderRecord) =>
    order.paid || payments.paid(order.id) !== undefined;

  return new Hono<AppEnv>()
    .post("/api/payments/:token/start", idempotent, (c) => {
      const order = buyerOrder(c.req.param("token"));
      if (settled(order)) {
        const answer: PaymentStartAnswer = {
          paid: true,
          amount: order.total,
          pay_url: null,
        };
        return c.json(answer);
      }
      if (!canPay(order)) throw closedError(order);
      payments.start(order.id, order.total, clock.now());
      const answer: PaymentStartAnswer = {
        paid: false,
        amount: order.total,
        pay_url: `/pay/${order.token}`,
      };
      return c.json(answer, 201);
    })
    .post("/api/payments/mock/:token/:result", (c) => {
      const result = parseInput(mockResultSchema, c.req.param("result"));
      const order = buyerOrder(c.req.param("token"));
      if (settled(order)) {
        const answer: PaymentResultAnswer = {
          result: "paid",
          order: page(order),
        };
        return c.json(answer);
      }
      if (!canPay(order)) throw closedError(order);
      const template = db.transaction(() => {
        const now = clock.now();
        const payment = payments.start(order.id, order.total, now);
        if (result === "fail") {
          payments.settle(payment.id, "failed", now);
          return null;
        }
        payments.settle(payment.id, "paid", now);
        return markPaid(orders, order);
      })();
      const fresh = orders.byId(order.storeId, order.id) ?? order;
      if (result === "pay") notify.changed(fresh, template);
      const answer: PaymentResultAnswer = {
        result: result === "pay" ? "paid" : "failed",
        order: page(fresh),
      };
      return c.json(answer);
    })
    .post("/api/desk/orders/:id/refund", auth, (c) => {
      const desk = c.get("desk");
      const order = orders.byId(desk.storeId, c.req.param("id"));
      if (order === undefined) {
        throw appError(404, "not_found", "This order is not on your desk.");
      }
      if (!settled(order)) {
        if (order.refund === null && !payments.refunded(order.id)) {
          throw appError(
            409,
            "forbidden",
            "This order is not paid, so there is nothing to refund.",
          );
        }
        const answer: DeskOrderAnswer = {
          order: notify.slip(order),
          warning: null,
        };
        return c.json(answer);
      }
      db.transaction(() => {
        const payment = payments.paid(order.id);
        if (payment !== undefined) payments.refund(payment.id, clock.now());
        orders.refund(order.id, {
          amount: payment?.amount ?? order.total,
          online: payment !== undefined,
        });
      })();
      const fresh = orders.byId(order.storeId, order.id) ?? order;
      const answer: DeskOrderAnswer = {
        order: notify.changed(fresh, null),
        warning: null,
      };
      return c.json(answer);
    });
}

function canPay(order: OrderRecord): boolean {
  return order.status !== "cancelled" && order.status !== "expired";
}

function closedError(order: OrderRecord): AppError {
  return appError(
    409,
    "order_closed",
    order.status === "expired"
      ? "This order expired, because it was not paid within 15 minutes. Order again from the store."
      : `${order.store.name} cancelled this order, so it cannot be paid.`,
  );
}
