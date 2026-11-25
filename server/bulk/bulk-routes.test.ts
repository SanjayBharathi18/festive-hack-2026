import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  boardPostPageSchema,
  bulkStoresSchema,
  deskBoardPostsSchema,
  emailProofSchema,
  interestAnswerSchema,
  type BoardPostCreate,
} from "../../shared/bulk.ts";
import { addDays } from "../../shared/day.ts";
import { errorBodySchema } from "../../shared/errors.ts";
import { verifyStartAnswerSchema } from "../../shared/verify.ts";
import { demoBoardToken } from "../demo/seed-bulk-catering.ts";
import {
  daawatPhone,
  gharPhone,
  gharSlug,
  quoteApp,
} from "../quotes/test-quote-app.ts";
import { postJson } from "../verify/test-sign-in.ts";

const email = "procurement@acme-foods.in";
let posts = 0;

async function errorOf(response: Response) {
  return errorBodySchema.parse(await response.json()).error;
}

async function emailProof(
  shop: ReturnType<typeof quoteApp>,
  address = email,
): Promise<string> {
  const started = await postJson(shop.app, "/api/board-posts/email/start", {
    email: address,
  });
  assert.equal(started.status, 201, await started.clone().text());
  const { code, prototype } = verifyStartAnswerSchema.parse(
    await started.json(),
  );
  assert.equal(prototype, true);
  const checked = await postJson(shop.app, "/api/board-posts/email/check", {
    email: address,
    code,
  });
  assert.equal(checked.status, 200, await checked.clone().text());
  return emailProofSchema.parse(await checked.json()).proof;
}

async function writePost(
  shop: ReturnType<typeof quoteApp>,
  overrides: Partial<BoardPostCreate> = {},
) {
  const body: BoardPostCreate = {
    company_name: "Acme Foods",
    description: "A food company in Koramangala",
    items: [{ name: "Besan laddu", quantity: 800, unit: "pieces" }],
    need_by: addDays(shop.seed.day, 12),
    places: ["Koramangala office"],
    budget_per_unit: 2_000,
    city: "Bengaluru",
    proof: (await shop.proof()).proof,
    email_proof: await emailProof(
      shop,
      (posts += 1) === 1 ? email : `buyer${posts}@acme-foods.in`,
    ),
    language: "en",
    ...overrides,
  };
  return shop.post("/api/board-posts", body);
}

test("the Bulk tab lists the stores with a bulk section, their bulk items and an example post", async () => {
  const shop = quoteApp();
  const response = await shop.app.request("/api/bulk/stores");
  assert.equal(response.status, 200);
  const answer = bulkStoresSchema.parse(await response.json());
  assert.deepEqual(
    answer.stores.map(({ store }) => store.slug),
    [gharSlug, "shobhas-kitchen"],
  );
  assert.equal(answer.stores[0]?.line, "Bulk and corporate orders taken");
  assert.deepEqual(
    answer.stores[0]?.items.map(({ name }) => name),
    ["Kaju katli", "Assorted gift box (250 g)"],
  );
  assert.equal(answer.example_post, demoBoardToken("whitefield-diwali"));
});

test("each bulk store has her stars, or none while she has no rating", async () => {
  const shop = quoteApp();
  const set = shop.deps.db.prepare(
    "UPDATE stores SET rating_average = ?, rating_count = ? WHERE slug = ?",
  );
  const ratingOf = async () =>
    bulkStoresSchema
      .parse(await (await shop.app.request("/api/bulk/stores")).json())
      .stores.find(({ store }) => store.slug === gharSlug)?.rating;
  set.run(4.5, 186, gharSlug);
  assert.deepEqual(await ratingOf(), { average: 4.5, count: 186 });
  set.run(null, 0, gharSlug);
  assert.equal(await ratingOf(), null);
});

test("the Bulk tab keeps to the city of the buyer, by any of its names", async () => {
  const shop = quoteApp();
  const stores = async (query: string) => {
    const response = await shop.app.request(`/api/bulk/stores${query}`);
    assert.equal(response.status, 200, await response.clone().text());
    return bulkStoresSchema.parse(await response.json()).stores;
  };
  const bengaluru = await stores("?city=ಬೆಂಗಳೂರು");
  assert.ok(bengaluru.some(({ store }) => store.slug === gharSlug));
  assert.ok(bengaluru.every(({ store }) => store.city === "Bengaluru"));
  assert.deepEqual(await stores("?city=Udupi"), []);
  const long = await shop.app.request(
    `/api/bulk/stores?city=${"x".repeat(61)}`,
  );
  assert.equal(long.status, 400);
  assert.equal((await errorOf(long)).code, "invalid_input");
});

test("a work email code gives an email proof; a personal email or a wrong code does not", async () => {
  const shop = quoteApp();
  assert.match(await emailProof(shop), /^[\w-]{43}$/);
  const personal = await postJson(shop.app, "/api/board-posts/email/start", {
    email: "priya@gmail.com",
  });
  assert.equal(personal.status, 400);
  assert.match((await errorOf(personal)).message, /email/);
  await postJson(shop.app, "/api/board-posts/email/start", {
    email: "buyer@acme.in",
  });
  const wrong = await postJson(shop.app, "/api/board-posts/email/check", {
    email: "BUYER@acme.in ",
    code: "000000",
  });
  assert.equal(wrong.status, 400);
  assert.match((await errorOf(wrong)).code, /^code_(wrong|used)$/);
});

test("a company writes a board post with both proofs and sees it on its link", async () => {
  const shop = quoteApp();
  const response = await writePost(shop);
  assert.equal(response.status, 201, await response.clone().text());
  const page = boardPostPageSchema.parse(await response.json());
  assert.equal(page.post.status, "open");
  assert.equal(page.post.closed_by, null);
  assert.equal(page.post.company_name, "Acme Foods");
  assert.deepEqual(page.interests, []);
  assert.equal(page.post.is_demo, false);

  const again = await shop.app.request(`/api/board-posts/${page.token}`);
  assert.equal(again.status, 200);
  assert.deepEqual(
    boardPostPageSchema.parse(await again.json()).post,
    page.post,
  );
  const row = shop.deps.db
    .prepare("SELECT buyer_phone, work_email FROM board_posts WHERE id = ?")
    .get(page.post.id) as { buyer_phone: string; work_email: string };
  assert.match(row.work_email, /^[\w.]+@acme-foods\.in$/);
  assert.match(row.buyer_phone, /^\+9198765\d{5}$/);
  assert.equal(JSON.stringify(page).includes(row.work_email), false);

  const missing = await shop.app.request("/api/board-posts/no-such-board-post");
  assert.equal(missing.status, 404);
});

test("a board post needs a need-by day in the window and fresh proofs", async () => {
  const shop = quoteApp();
  const past = await writePost(shop, { need_by: "2026-11-01" });
  assert.equal((await errorOf(past)).code, "day_past");
  const far = await writePost(shop, { need_by: addDays(shop.seed.day, 400) });
  assert.equal((await errorOf(far)).code, "day_too_far");
  const noEmail = await writePost(shop, { email_proof: "y".repeat(43) });
  assert.equal(noEmail.status, 401);
  assert.match((await errorOf(noEmail)).message, /work email/);
  const company = await writePost(shop, { company_name: "" });
  assert.equal(company.status, 201);
  assert.equal(
    boardPostPageSchema.parse(await company.json()).post.company_name,
    null,
  );
});

test("the company edits its post until it closes it, and can open it again", async () => {
  const shop = quoteApp();
  const { token, post } = boardPostPageSchema.parse(
    await (await writePost(shop)).json(),
  );
  const patch = (body: unknown) =>
    shop.send("PATCH", `/api/board-posts/${token}`, body);
  const fields = {
    company_name: null,
    description: post.description,
    items: [
      ...post.items,
      { name: "Kaju katli", quantity: 300, unit: "boxes" },
    ],
    need_by: post.need_by,
    places: [...post.places, "Bellandur office"],
    budget_per_unit: null,
    city: post.city,
  };
  const edited = boardPostPageSchema.parse(
    await (await patch({ action: "edit", post: fields })).json(),
  );
  assert.equal(edited.post.items.length, 2);
  assert.equal(edited.post.company_name, null);
  assert.equal(edited.post.budget_per_unit, null);

  const closed = boardPostPageSchema.parse(
    await (await patch({ action: "close" })).json(),
  );
  assert.equal(closed.post.status, "closed");
  assert.equal(closed.post.closed_by, "company");
  const late = await patch({ action: "edit", post: fields });
  assert.equal(late.status, 409);
  assert.equal((await errorOf(late)).code, "order_closed");

  const reopened = boardPostPageSchema.parse(
    await (await patch({ action: "reopen" })).json(),
  );
  assert.equal(reopened.post.status, "open");
});

test("a post closes by itself after its need-by day", async () => {
  const shop = quoteApp();
  const { token, post } = boardPostPageSchema.parse(
    await (await writePost(shop)).json(),
  );
  shop.deps.db
    .prepare("UPDATE board_posts SET need_by = ? WHERE id = ?")
    .run(addDays(shop.seed.day, -1), post.id);
  const page = boardPostPageSchema.parse(
    await (await shop.app.request(`/api/board-posts/${token}`)).json(),
  );
  assert.equal(page.post.status, "closed");
  assert.equal(page.post.closed_by, "date");
  const reopen = await shop.send("PATCH", `/api/board-posts/${token}`, {
    action: "reopen",
  });
  assert.equal(reopen.status, 409);
});

test("a store with a bulk section sees the board of its city and answers I can do this", async () => {
  const shop = quoteApp();
  const { token, post } = boardPostPageSchema.parse(
    await (await writePost(shop)).json(),
  );
  const cookie = await shop.sellerCookie(gharPhone);
  const board = deskBoardPostsSchema.parse(
    await (
      await shop.app.request("/api/desk/board-posts", {
        headers: { Cookie: cookie },
      })
    ).json(),
  );
  assert.equal(board.bulk_on, true);
  assert.equal(board.city, "Bengaluru");
  assert.deepEqual(
    board.posts.map(({ description }) => description),
    ["A food company in Koramangala", "A tech company in Whitefield"],
  );
  assert.equal(board.posts[0]?.interest, null);
  assert.equal(
    board.posts[1]?.interest?.note,
    "We can do both. Samples on WhatsApp.",
  );
  assert.equal(board.posts[0]?.description_translation, null);

  const answered = await shop.post(
    `/api/desk/board-posts/${post.id}/interest`,
    { note: "Yes, with gift wrap." },
    { Cookie: cookie },
  );
  assert.equal(answered.status, 201, await answered.clone().text());
  const answer = interestAnswerSchema.parse(await answered.json());
  assert.equal(answer.interest.note, "Yes, with gift wrap.");
  assert.equal(answer.interest.note_language, "hi-IN");

  const page = boardPostPageSchema.parse(
    await (await shop.app.request(`/api/board-posts/${token}`)).json(),
  );
  assert.deepEqual(
    page.interests.map(({ store, note }) => [store.slug, note]),
    [[gharSlug, "Yes, with gift wrap."]],
  );
});

test("a store without a bulk section gets no board and cannot answer", async () => {
  const shop = quoteApp();
  const { post } = boardPostPageSchema.parse(
    await (await writePost(shop)).json(),
  );
  const cookie = await shop.sellerCookie(daawatPhone);
  const board = deskBoardPostsSchema.parse(
    await (
      await shop.app.request("/api/desk/board-posts", {
        headers: { Cookie: cookie },
      })
    ).json(),
  );
  assert.deepEqual(board, { bulk_on: false, city: "Bengaluru", posts: [] });
  const answer = await shop.post(
    `/api/desk/board-posts/${post.id}/interest`,
    { note: null },
    { Cookie: cookie },
  );
  assert.equal(answer.status, 403);
});

test("an answer needs an open post of her city", async () => {
  const shop = quoteApp();
  const { token, post } = boardPostPageSchema.parse(
    await (await writePost(shop, { city: "Mysuru" })).json(),
  );
  const cookie = await shop.sellerCookie(gharPhone);
  const answer = (id: string) =>
    shop.post(`/api/desk/board-posts/${id}/interest`, {}, { Cookie: cookie });
  assert.equal((await answer(post.id)).status, 404);
  assert.equal((await answer(randomUUID())).status, 404);

  const local = boardPostPageSchema.parse(await (await writePost(shop)).json());
  await shop.send("PATCH", `/api/board-posts/${local.token}`, {
    action: "close",
  });
  const closed = await answer(local.post.id);
  assert.equal(closed.status, 409);
  assert.equal(token.length > 16, true);
});

test("a post whose city is in another script reaches the stores of that city", async () => {
  const shop = quoteApp();
  const { post } = boardPostPageSchema.parse(
    await (await writePost(shop, { city: "बेंगलुरु" })).json(),
  );
  const cookie = await shop.sellerCookie(gharPhone);
  const board = deskBoardPostsSchema.parse(
    await (
      await shop.app.request("/api/desk/board-posts", {
        headers: { Cookie: cookie },
      })
    ).json(),
  );
  assert.ok(board.posts.some(({ id }) => id === post.id));
  const answered = await shop.post(
    `/api/desk/board-posts/${post.id}/interest`,
    { note: null },
    { Cookie: cookie },
  );
  assert.equal(answered.status, 201, await answered.clone().text());
});

test("the example post is the same for every visitor: it can be seen, not changed", async () => {
  const shop = quoteApp();
  const token = demoBoardToken("whitefield-diwali");
  const before = boardPostPageSchema.parse(
    await (await shop.app.request(`/api/board-posts/${token}`)).json(),
  );
  assert.equal(before.post.is_demo, true);
  for (const body of [
    { action: "close" },
    { action: "reopen" },
    {
      action: "edit",
      post: {
        company_name: "Someone else",
        description: before.post.description,
        items: before.post.items,
        need_by: before.post.need_by,
        places: before.post.places,
        budget_per_unit: before.post.budget_per_unit,
        city: before.post.city,
      },
    },
  ]) {
    const response = await shop.send(
      "PATCH",
      `/api/board-posts/${token}`,
      body,
    );
    assert.equal(response.status, 403, body.action);
    assert.equal((await errorOf(response)).code, "forbidden");
  }
  const after = boardPostPageSchema.parse(
    await (await shop.app.request(`/api/board-posts/${token}`)).json(),
  );
  assert.deepEqual(after.post, before.post);
});

test("the Bulk tab gives each bulk item a name in the buyer's script when it asks", async () => {
  const shop = quoteApp();
  const answer = bulkStoresSchema.parse(
    await (await shop.app.request("/api/bulk/stores?lang=en")).json(),
  );
  const shobha = answer.stores.find(
    ({ store }) => store.slug === "shobhas-kitchen",
  );
  const box = shobha?.items.find(({ name }) => name === "ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್");
  assert.equal(box?.name_script, "Diwali assorted box");
  const plain = bulkStoresSchema.parse(
    await (await shop.app.request("/api/bulk/stores")).json(),
  );
  assert.ok(
    plain.stores.every(({ items }) =>
      items.every(({ name_script }) => name_script === null),
    ),
  );
});
