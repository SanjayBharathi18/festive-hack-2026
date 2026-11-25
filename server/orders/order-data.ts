import { randomBytes } from "node:crypto";
import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type {
  Fulfilment,
  OrderSource,
  OrderStatus,
} from "../../shared/model.ts";
import type {
  CancelReason,
  OrderLine,
  ShownLine,
} from "../../shared/orders.ts";
import type { ReadVariant } from "../../shared/reading.ts";
import type { Db } from "../db/database.ts";

export type OrderStore = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  city: string | null;
  address: string | null;
  isDemo: boolean;
  sellerPhone: string;
  sellerLanguage: AppLanguage;
};

export type OrderFields = {
  fulfilment: Fulfilment;
  day: Day;
  address: string | null;
  note: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  total: number;
};

export type NewOrder = OrderFields & {
  id: string;
  storeId: string;
  token: string;
  source: OrderSource;
  status: OrderStatus;
  giftName: string | null;
  giftPhone: string | null;
  giftMessage: string | null;
  buyerLanguage: AppLanguage | null;
  paymentRequired: boolean;
  transcript: string | null;
  readingLanguage: string | null;
  readingVariant: ReadVariant | null;
  edited: boolean;
  createdAt: number;
};

export type Refund = { amount: number; online: boolean };

export type OrderRecord = NewOrder & {
  number: number;
  paid: boolean;
  refunded: boolean;
  refund: Refund | null;
  cancelReason: CancelReason | null;
  lines: ShownLine[];
  store: OrderStore;
};

export type OrderData = ReturnType<typeof createOrderData>;

type OrderRow = {
  id: string;
  store_id: string;
  number: number;
  token: string;
  source: OrderSource;
  status: OrderStatus;
  fulfilment: Fulfilment;
  address: string | null;
  gift_name: string | null;
  gift_phone: string | null;
  gift_message: string | null;
  note: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  buyer_language: AppLanguage | null;
  day: Day;
  total: number;
  paid: number;
  payment_required: number;
  cancel_reason: CancelReason | null;
  transcript: string | null;
  reading_language: string | null;
  reading_variant: ReadVariant | null;
  edited: number;
  created_at: number;
  store_slug: string;
  store_name: string;
  store_area: string | null;
  store_city: string | null;
  store_address: string | null;
  store_is_demo: number;
  refunded: number;
  refund_amount: number | null;
  refund_online: number;
  seller_phone: string;
  seller_language: AppLanguage;
};

type LineRow = Omit<ShownLine, "label"> & {
  order_id: string;
  label: string | null;
};

const orderSelect = `SELECT orders.*, stores.slug AS store_slug,
    stores.name AS store_name, stores.area AS store_area,
    stores.city AS store_city, stores.address AS store_address,
    stores.is_demo AS store_is_demo,
    sellers.phone AS seller_phone, sellers.language AS seller_language,
    EXISTS (SELECT 1 FROM payments WHERE payments.order_id = orders.id
      AND payments.refunded > 0) AS refunded
  FROM orders JOIN stores ON stores.id = orders.store_id
  JOIN sellers ON sellers.id = stores.seller_id`;

const lineSelect = `SELECT order_items.order_id, order_items.item_id,
    order_items.pack_id, items.name, packs.label, order_items.quantity,
    order_items.price, order_items.grams, order_items.pieces, items.veg_mark,
    items.name_latin
  FROM order_items JOIN items ON items.id = order_items.item_id
  LEFT JOIN packs ON packs.id = order_items.pack_id`;

const boardFilter = `orders.store_id = @store AND (orders.day BETWEEN @from AND @to
  OR (@open_before = 1 AND orders.day < @from
    AND orders.status IN ('awaiting_payment', 'new', 'making', 'ready')))`;

export function createOrderData(db: Db) {
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, store_id, number, token, source, status, fulfilment,
      address, gift_name, gift_phone, gift_message, note, buyer_name,
      buyer_phone, buyer_language, day, total, payment_required, transcript,
      reading_language, reading_variant, edited, created_at)
    VALUES (@id, @storeId,
      (SELECT coalesce(max(number), 0) + 1 FROM orders WHERE store_id = @storeId),
      @token, @source, @status, @fulfilment, @address, @giftName, @giftPhone,
      @giftMessage, @note, @buyerName, @buyerPhone, @buyerLanguage, @day,
      @total, @paymentRequired, @transcript, @readingLanguage,
      @readingVariant, @edited, @createdAt)`,
  );
  const insertLine = db.prepare(
    `INSERT INTO order_items (order_id, item_id, pack_id, quantity, price, grams, pieces)
    VALUES (@order_id, @item_id, @pack_id, @quantity, @price, @grams, @pieces)`,
  );
  const removeLines = db.prepare("DELETE FROM order_items WHERE order_id = ?");
  const exists = db.prepare("SELECT 1 FROM orders WHERE id = ?").pluck();
  const byToken = db.prepare(`${orderSelect} WHERE orders.token = ?`);
  const byId = db.prepare(
    `${orderSelect} WHERE orders.store_id = ? AND orders.id = ?`,
  );
  const board = db.prepare(
    `${orderSelect} WHERE ${boardFilter} ORDER BY orders.day, orders.number`,
  );
  const linesOf = db.prepare(
    `${lineSelect} WHERE order_items.order_id = ? ORDER BY order_items.rowid`,
  );
  const boardLines = db.prepare(
    `${lineSelect} WHERE order_items.order_id IN
      (SELECT orders.id FROM orders WHERE ${boardFilter})
    ORDER BY order_items.rowid`,
  );
  const money = db.prepare(
    "SELECT status, total, paid FROM orders WHERE store_id = ? AND day BETWEEN ? AND ?",
  );
  const setStatus = db.prepare(
    "UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?",
  );
  const setPaid = db.prepare("UPDATE orders SET paid = ? WHERE id = ?");
  const setRefund = db.prepare(
    "UPDATE orders SET paid = 0, refund_amount = ?, refund_online = ? WHERE id = ?",
  );
  const remove = db.prepare("DELETE FROM orders WHERE id = ?");
  const setFields = db.prepare(
    `UPDATE orders SET fulfilment = @fulfilment, day = @day, address = @address,
      note = @note, buyer_name = @buyerName, buyer_phone = @buyerPhone,
      total = @total
    WHERE id = @id`,
  );

  const writeLines = (orderId: string, lines: readonly OrderLine[]) => {
    for (const line of lines) {
      insertLine.run({
        order_id: orderId,
        item_id: line.item_id,
        pack_id: line.pack_id,
        quantity: line.quantity,
        price: line.price,
        grams: line.grams,
        pieces: line.pieces,
      });
    }
  };
  const one = (row: unknown): OrderRecord | undefined => {
    if (row === undefined) return undefined;
    const order = row as OrderRow;
    return toRecord(order, (linesOf.all(order.id) as LineRow[]).map(toLine));
  };

  return {
    insert: (order: NewOrder, lines: readonly OrderLine[]) => {
      insertOrder.run({
        ...order,
        paymentRequired: yesNo(order.paymentRequired),
        edited: yesNo(order.edited),
      });
      writeLines(order.id, lines);
    },
    exists: (id: string) => exists.get(id) !== undefined,
    byToken: (token: string) => one(byToken.get(token)),
    byId: (storeId: string, id: string) => one(byId.get(storeId, id)),
    list: (storeId: string, from: Day, to: Day, openBefore = false) => {
      const filter = {
        store: storeId,
        from,
        to,
        open_before: yesNo(openBefore),
      };
      const lines = Map.groupBy(
        boardLines.all(filter) as LineRow[],
        (line) => line.order_id,
      );
      return (board.all(filter) as OrderRow[]).map((row) =>
        toRecord(row, (lines.get(row.id) ?? []).map(toLine)),
      );
    },
    money: (storeId: string, from: Day, to: Day) =>
      (
        money.all(storeId, from, to) as {
          status: OrderStatus;
          total: number;
          paid: number;
        }[]
      ).map((row) => ({ ...row, paid: row.paid === 1 })),
    setStatus: (id: string, status: OrderStatus, reason: CancelReason | null) =>
      void setStatus.run(status, reason, id),
    setPaid: (id: string, paid: boolean) => void setPaid.run(yesNo(paid), id),
    // A refund gives the money back and stays on the order, so that the desk
    // still shows it after a reload.
    refund: (id: string, { amount, online }: Refund) =>
      void setRefund.run(amount, yesNo(online), id),
    remove: (id: string) => void remove.run(id),
    edit: (id: string, fields: OrderFields, lines: readonly OrderLine[]) => {
      setFields.run({ ...fields, id });
      removeLines.run(id);
      writeLines(id, lines);
    },
  };
}

export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

export function packLabel(grams: number | null, pieces: number | null): string {
  if (grams !== null) {
    return grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
  }
  return pieces === null ? "" : `${pieces} pcs`;
}

function toLine({ order_id: _, label, ...line }: LineRow): ShownLine {
  return { ...line, label: label ?? packLabel(line.grams, line.pieces) };
}

function toRecord(row: OrderRow, lines: ShownLine[]): OrderRecord {
  return {
    id: row.id,
    storeId: row.store_id,
    number: row.number,
    token: row.token,
    source: row.source,
    status: row.status,
    fulfilment: row.fulfilment,
    day: row.day,
    address: row.address,
    note: row.note,
    giftName: row.gift_name,
    giftPhone: row.gift_phone,
    giftMessage: row.gift_message,
    buyerName: row.buyer_name,
    buyerPhone: row.buyer_phone,
    buyerLanguage: row.buyer_language,
    total: row.total,
    paid: row.paid === 1,
    refunded: row.refunded === 1,
    refund:
      row.refund_amount === null
        ? null
        : { amount: row.refund_amount, online: row.refund_online === 1 },
    paymentRequired: row.payment_required === 1,
    cancelReason: row.cancel_reason,
    transcript: row.transcript,
    readingLanguage: row.reading_language,
    readingVariant: row.reading_variant,
    edited: row.edited === 1,
    createdAt: row.created_at,
    lines,
    store: {
      id: row.store_id,
      slug: row.store_slug,
      name: row.store_name,
      area: row.store_area,
      city: row.store_city,
      address: row.store_address,
      isDemo: row.store_is_demo === 1,
      sellerPhone: row.seller_phone,
      sellerLanguage: row.seller_language,
    },
  };
}

function yesNo(value: boolean): number {
  return value ? 1 : 0;
}
