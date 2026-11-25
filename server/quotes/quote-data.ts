import type { AppLanguage } from "../../shared/languages.ts";
import type { QuoteKind, QuotePayload } from "../../shared/quotes.ts";
import type { Db } from "../db/database.ts";

export type QuoteRow = {
  id: string;
  storeId: string;
  kind: QuoteKind;
  payload: QuotePayload;
  buyerName: string;
  buyerPhone: string;
  language: AppLanguage;
  createdAt: number;
};

type StoredRow = {
  id: string;
  store_id: string;
  kind: QuoteKind;
  payload: string;
  buyer_name: string;
  buyer_phone: string;
  language: AppLanguage;
  created_at: number;
};

export function createQuoteData(db: Db) {
  const insert = db.prepare(
    `INSERT INTO quote_requests (id, store_id, kind, payload, buyer_name,
      buyer_phone, language, created_at)
    VALUES (@id, @store_id, @kind, @payload, @buyer_name, @buyer_phone,
      @language, @created_at)`,
  );
  const list = db.prepare(
    `SELECT id, store_id, kind, payload, buyer_name, buyer_phone, language,
      created_at
    FROM quote_requests WHERE store_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT ?`,
  );
  return {
    insert(quote: QuoteRow): void {
      insert.run({
        id: quote.id,
        store_id: quote.storeId,
        kind: quote.kind,
        payload: JSON.stringify(quote.payload),
        buyer_name: quote.buyerName,
        buyer_phone: quote.buyerPhone,
        language: quote.language,
        created_at: quote.createdAt,
      });
    },
    list(storeId: string, limit = 100): QuoteRow[] {
      return (list.all(storeId, limit) as StoredRow[]).map((row) => ({
        id: row.id,
        storeId: row.store_id,
        kind: row.kind,
        payload: JSON.parse(row.payload) as QuotePayload,
        buyerName: row.buyer_name,
        buyerPhone: row.buyer_phone,
        language: row.language,
        createdAt: row.created_at,
      }));
    },
  };
}
