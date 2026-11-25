import assert from "node:assert/strict";
import { test } from "node:test";
import type { z } from "zod";
import type { DeskBoardPost, DeskBoardPosts } from "../../shared/bulk.ts";
import type { Api } from "../api/api.ts";
import { createBoardPosts } from "./board-posts.ts";

const postId = "0b6f3c3e-7d0a-4b8e-9a51-2f9c1d4e5a60";
const post: DeskBoardPost = {
  id: postId,
  company_name: null,
  description: "A tech company in Whitefield",
  description_translation: { text: "ವೈಟ್‌ಫೀಲ್ಡ್‌ನ ಒಂದು ಟೆಕ್ ಕಂಪನಿ", language: "kn" },
  items: [
    { name: "Sweet box", quantity: 300, unit: "boxes", name_translation: null },
  ],
  need_by: "2026-12-10",
  places: ["Whitefield"],
  budget_per_unit: 25_000,
  city: "Bengaluru",
  is_demo: true,
  created_at: 1_795_450_950_267,
  interest: null,
};

type Sent = {
  path: string;
  body: unknown;
  answer(note: string | null): void;
  fail(error: unknown): void;
};

function setup(
  board: DeskBoardPosts = { bulk_on: true, city: "Bengaluru", posts: [post] },
) {
  const sent: Sent[] = [];
  const api: Pick<Api, "get" | "send"> = {
    get: <S extends z.ZodType>(_path: string, schema: S) =>
      Promise.resolve(schema.parse(board)),
    send: <S extends z.ZodType>(
      _method: string,
      path: string,
      body: unknown,
      schema: S,
    ) =>
      new Promise<z.output<S>>((resolve, reject) => {
        sent.push({
          path,
          body,
          answer: (note) =>
            resolve(
              schema.parse({
                post_id: postId,
                interest: { note, note_language: "kn-IN", created_at: 2 },
              }),
            ),
          fail: reject,
        });
      }),
  };
  const posts = createBoardPosts({ api, now: () => 1 });
  let changes = 0;
  posts.subscribe(() => changes++);
  return { posts, sent, changes: () => changes };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const offline = Object.assign(new Error("No network."), { code: "network" });

test("the board loads the posts of her city", async () => {
  const { posts, changes } = setup();
  assert.equal(posts.loaded(), false);
  await posts.load(new AbortController().signal);
  assert.equal(posts.loaded(), true);
  assert.equal(posts.city(), "Bengaluru");
  assert.deepEqual(posts.posts(), [post]);
  assert.equal(changes(), 1);
});

test("I can do this shows at once and keeps the answer of the server", async () => {
  const { posts, sent } = setup();
  await posts.load(new AbortController().signal);
  posts.answer(postId, "I can deliver on the 9th");
  assert.equal(posts.sending(postId), true);
  assert.equal(posts.posts()[0]?.interest?.note, "I can deliver on the 9th");
  assert.deepEqual(
    sent.map((each) => [each.path, each.body]),
    [
      [
        `/api/desk/board-posts/${postId}/interest`,
        { note: "I can deliver on the 9th" },
      ],
    ],
  );
  sent[0]?.answer("I can deliver on the 9th");
  await settle();
  assert.equal(posts.sending(postId), false);
  assert.deepEqual(posts.posts()[0]?.interest, {
    note: "I can deliver on the 9th",
    note_language: "kn-IN",
    created_at: 2,
  });
});

test("a refresh does not undo an answer on its way", async () => {
  const { posts, sent } = setup();
  await posts.load(new AbortController().signal);
  posts.answer(postId, null);
  await posts.load(new AbortController().signal);
  assert.deepEqual(posts.posts()[0]?.interest, {
    note: null,
    note_language: null,
    created_at: 1,
  });
  sent[0]?.answer(null);
  await settle();
  assert.equal(posts.posts()[0]?.interest?.note_language, "kn-IN");
});

test("a failed answer brings back the earlier one and says why", async () => {
  const { posts, sent } = setup();
  await posts.load(new AbortController().signal);
  posts.answer(postId, "Ready by Monday");
  sent[0]?.fail(offline);
  await settle();
  assert.equal(posts.sending(postId), false);
  assert.equal(posts.posts()[0]?.interest, null);
  assert.equal(posts.failure(postId), offline);
  posts.answer(postId, "Ready by Monday");
  assert.equal(posts.failure(postId), undefined);
});

test("a later answer that the server takes clears an earlier failure", async () => {
  const { posts, sent } = setup();
  await posts.load(new AbortController().signal);
  posts.answer(postId, "First");
  posts.answer(postId, "Second");
  sent[0]?.fail(offline);
  await settle();
  assert.equal(posts.sending(postId), true);
  assert.equal(posts.posts()[0]?.interest?.note, "Second");
  sent[1]?.answer("Second");
  await settle();
  assert.equal(posts.failure(postId), undefined);
  assert.equal(posts.posts()[0]?.interest?.note, "Second");
});
