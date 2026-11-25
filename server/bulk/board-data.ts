import { randomBytes } from "node:crypto";
import type {
  BoardItem,
  BoardPost,
  BoardPostFields,
  DeskInterest,
  ListedStore,
} from "../../shared/bulk.ts";
import { sameCity } from "../../shared/cities.ts";
import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { Db } from "../db/database.ts";

export type BoardPostRow = {
  id: string;
  token: string;
  buyer_phone: string;
  work_email: string;
  company_name: string | null;
  description: string;
  items: string;
  need_by: Day;
  places: string;
  budget_per_unit: number | null;
  city: string;
  status: "open" | "closed";
  language: AppLanguage;
  is_demo: number;
  created_at: number;
  updated_at: number;
};

export type NewBoardPost = BoardPostFields & {
  id: string;
  token: string;
  buyerPhone: string;
  workEmail: string;
  language: AppLanguage;
  isDemo: boolean;
  createdAt: number;
};

export type InterestRow = {
  store_id: string;
  note: string | null;
  note_language: string | null;
  created_at: number;
  store: ListedStore;
};

export function createBoardData(db: Db) {
  const columns = `id, token, buyer_phone, work_email, company_name,
    description, items, need_by, places, budget_per_unit, city, status,
    language, is_demo, created_at, updated_at`;
  const byToken = db.prepare(
    `SELECT ${columns} FROM board_posts WHERE token = ?`,
  );
  const byId = db.prepare(`SELECT ${columns} FROM board_posts WHERE id = ?`);
  const open = db.prepare(
    `SELECT ${columns} FROM board_posts
    WHERE status = 'open' AND need_by >= ?
    ORDER BY created_at DESC, rowid DESC`,
  );
  const insert = db.prepare(
    `INSERT INTO board_posts (${columns})
    VALUES (@id, @token, @buyer_phone, @work_email, @company_name,
      @description, @items, @need_by, @places, @budget_per_unit, @city,
      'open', @language, @is_demo, @created_at, @created_at)
    ON CONFLICT (id) DO UPDATE SET token = excluded.token,
      buyer_phone = excluded.buyer_phone, work_email = excluded.work_email,
      company_name = excluded.company_name,
      description = excluded.description, items = excluded.items,
      need_by = excluded.need_by, places = excluded.places,
      budget_per_unit = excluded.budget_per_unit, city = excluded.city,
      status = 'open', language = excluded.language,
      is_demo = excluded.is_demo, created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
  );
  const edit = db.prepare(
    `UPDATE board_posts SET company_name = @company_name,
      description = @description, items = @items, need_by = @need_by,
      places = @places, budget_per_unit = @budget_per_unit, city = @city,
      updated_at = @updated_at
    WHERE id = @id`,
  );
  const status = db.prepare(
    "UPDATE board_posts SET status = ?, updated_at = ? WHERE id = ?",
  );
  const interests = db.prepare(
    `SELECT board_interests.store_id, note, note_language, created_at,
      stores.slug, stores.name, stores.area, stores.city, stores.is_demo
    FROM board_interests JOIN stores ON stores.id = board_interests.store_id
    WHERE board_post_id = ? ORDER BY created_at`,
  );
  const interest = db.prepare(
    `SELECT note, note_language, created_at FROM board_interests
    WHERE board_post_id = ? AND store_id = ?`,
  );
  const interestsOfStore = db.prepare(
    `SELECT board_post_id, note, note_language, created_at FROM board_interests
    WHERE store_id = ?`,
  );
  const answer = db.prepare(
    `INSERT INTO board_interests (board_post_id, store_id, note, note_language,
      created_at)
    VALUES (@board_post_id, @store_id, @note, @note_language, @created_at)
    ON CONFLICT (board_post_id, store_id) DO UPDATE SET note = excluded.note,
      note_language = excluded.note_language`,
  );

  return {
    byToken: (token: string) => byToken.get(token) as BoardPostRow | undefined,
    byId: (id: string) => byId.get(id) as BoardPostRow | undefined,
    openInCity: (city: string, today: Day) =>
      (open.all(today) as BoardPostRow[]).filter((row) =>
        sameCity(row.city, city),
      ),
    insert(post: NewBoardPost): void {
      insert.run({
        ...fieldValues(post),
        id: post.id,
        token: post.token,
        buyer_phone: post.buyerPhone,
        work_email: post.workEmail,
        language: post.language,
        is_demo: post.isDemo ? 1 : 0,
        created_at: post.createdAt,
      });
    },
    edit(id: string, fields: BoardPostFields, now: number): void {
      edit.run({ ...fieldValues(fields), id, updated_at: now });
    },
    setStatus(id: string, next: "open" | "closed", now: number): void {
      status.run(next, now, id);
    },
    interests(postId: string): InterestRow[] {
      const rows = interests.all(postId) as (Omit<InterestRow, "store"> &
        Omit<ListedStore, "id" | "is_demo"> & { is_demo: number })[];
      return rows.map(({ slug, name, area, city, is_demo, ...row }) => ({
        ...row,
        store: {
          id: row.store_id,
          slug,
          name,
          area,
          city,
          is_demo: is_demo === 1,
        },
      }));
    },
    interestOf: (postId: string, storeId: string) =>
      interest.get(postId, storeId) as DeskInterest | undefined,
    interestsOfStore(storeId: string): Map<string, DeskInterest> {
      const rows = interestsOfStore.all(storeId) as (DeskInterest & {
        board_post_id: string;
      })[];
      return new Map(
        rows.map(({ board_post_id, ...entry }) => [board_post_id, entry]),
      );
    },
    answer(entry: {
      postId: string;
      storeId: string;
      note: string | null;
      noteLanguage: string | null;
      createdAt: number;
    }): void {
      answer.run({
        board_post_id: entry.postId,
        store_id: entry.storeId,
        note: entry.note,
        note_language: entry.noteLanguage,
        created_at: entry.createdAt,
      });
    },
  };
}

export type BoardData = ReturnType<typeof createBoardData>;

export function newBoardToken(): string {
  return randomBytes(18).toString("base64url");
}

export function boardPost(row: BoardPostRow, today: Day): BoardPost {
  const closedBy =
    row.status === "closed" ? "company" : row.need_by < today ? "date" : null;
  return {
    id: row.id,
    company_name: row.company_name,
    description: row.description,
    items: JSON.parse(row.items) as BoardItem[],
    need_by: row.need_by,
    places: JSON.parse(row.places) as string[],
    budget_per_unit: row.budget_per_unit,
    city: row.city,
    status: closedBy === null ? "open" : "closed",
    closed_by: closedBy,
    is_demo: row.is_demo === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function shownCompany(
  post: Pick<BoardPost, "company_name" | "description">,
): string {
  return post.company_name ?? post.description;
}

function fieldValues(fields: BoardPostFields) {
  return {
    company_name: fields.company_name,
    description: fields.description,
    items: JSON.stringify(fields.items),
    need_by: fields.need_by,
    places: JSON.stringify(fields.places),
    budget_per_unit: fields.budget_per_unit,
    city: fields.city,
  };
}
