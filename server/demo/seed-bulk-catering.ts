import { createHash } from "node:crypto";
import { addDays, type Day } from "../../shared/day.ts";
import { createBoardData } from "../bulk/board-data.ts";
import { writePackage } from "../catering/package-data.ts";
import { createQuoteData } from "../quotes/quote-data.ts";
import type { Db } from "../db/database.ts";
import type { DemoBoardPost, DemoStore } from "./demo-fixture.ts";

type SeedDays = Record<"saturday" | "sunday", Day>;

// A refresh deletes what visitors and testers left on a demo store: its quote
// requests and its answers on the request board, like its orders.
export function clearDemoRequests(db: Db, storeId: string): void {
  db.prepare("DELETE FROM quote_requests WHERE store_id = ?").run(storeId);
  db.prepare("DELETE FROM board_interests WHERE store_id = ?").run(storeId);
}

// Her packages and her booked dates come back as the seed has them.
export function seedCatering(
  db: Db,
  {
    store,
    storeId,
    days,
    stableId,
  }: {
    store: DemoStore;
    storeId: string;
    days: SeedDays;
    stableId: (...parts: string[]) => string;
  },
): void {
  db.prepare("DELETE FROM packages WHERE store_id = ?").run(storeId);
  for (const { key, ...input } of store.packages) {
    writePackage(db, {
      storeId,
      id: stableId("package", store.slug, key),
      input,
      newId: (...names) => stableId("package-part", store.slug, ...names),
    });
  }
  const close = db.prepare(
    "INSERT INTO closed_dates (store_id, date) VALUES (?, ?) ON CONFLICT DO NOTHING",
  );
  for (const day of store.closed) close.run(storeId, days[day]);
}

// Her quote requests from made-up buyers, built from her bulk items as a
// buyer's request would be, so that the desk shows them.
export function seedQuotes(
  db: Db,
  {
    store,
    storeId,
    day,
    now,
    stableId,
  }: {
    store: DemoStore;
    storeId: string;
    day: Day;
    now: number;
    stableId: (...parts: string[]) => string;
  },
): void {
  const quotes = createQuoteData(db);
  for (const quote of store.quotes) {
    const lines = quote.lines.flatMap(({ item: key, quantity }) => {
      const item = store.items?.find((entry) => entry.key === key);
      if (item?.bulk === undefined) return [];
      return [
        {
          item_id: stableId("item", store.slug, key),
          name: item.name,
          quantity,
          unit: item.bulk.unit,
          price: item.bulk.price,
        },
      ];
    });
    quotes.insert({
      id: stableId("quote", store.slug, quote.key),
      storeId,
      kind: "bulk",
      payload: {
        kind: "bulk",
        lines,
        estimate: lines.every(({ price }) => price !== null)
          ? lines.reduce(
              (sum, { price, quantity }) => sum + (price ?? 0) * quantity,
              0,
            )
          : null,
        need_by:
          quote.need_by_days === null ? null : addDays(day, quote.need_by_days),
        place: quote.place,
        note: quote.note,
      },
      buyerName: quote.buyer_name,
      buyerPhone: quote.buyer_phone,
      language: quote.language,
      createdAt: now - quote.minutes_ago * 60_000,
    });
  }
}

// The demo board posts open again, need-by days from the seed day, with the
// answers of the seed.
export function seedBoardPosts(
  db: Db,
  posts: readonly DemoBoardPost[],
  {
    day,
    now,
    storeIds,
    stableId,
  }: {
    day: Day;
    now: number;
    storeIds: Readonly<Record<string, string>>;
    stableId: (...parts: string[]) => string;
  },
): void {
  const boards = createBoardData(db);
  for (const post of posts) {
    const id = stableId("board-post", post.key);
    boards.insert({
      id,
      token: demoBoardToken(post.key),
      buyerPhone: post.buyer_phone,
      workEmail: post.work_email,
      language: post.language,
      isDemo: true,
      createdAt: now,
      company_name: post.company_name,
      description: post.description,
      items: post.items,
      need_by: addDays(day, post.need_by_days),
      places: post.places,
      budget_per_unit: post.budget_per_unit,
      city: post.city,
    });
    db.prepare("DELETE FROM board_interests WHERE board_post_id = ?").run(id);
    for (const interest of post.interests) {
      const storeId = storeIds[interest.store];
      if (storeId === undefined) continue;
      boards.answer({
        postId: id,
        storeId,
        note: interest.note,
        noteLanguage: interest.note === null ? null : "en-IN",
        createdAt: now,
      });
    }
  }
}

// The link of a demo post is public: the Bulk tab links it as an example.
export function demoBoardToken(key: string): string {
  return `demo-${createHash("sha256").update(`board-post:${key}`).digest("base64url").slice(0, 22)}`;
}
