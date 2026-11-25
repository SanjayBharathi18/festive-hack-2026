import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardPostFields, BoardPostPage } from "../../shared/bulk.ts";
import type { Api } from "../api/api.ts";
import { createBoardFlow } from "./board-flow.ts";

const fields: BoardPostFields = {
  company_name: null,
  description: "A tech company in Whitefield",
  items: [{ name: "Kaju katli", quantity: 1000, unit: "pieces" }],
  need_by: "2026-12-04",
  places: ["Whitefield office"],
  budget_per_unit: 25_000,
  city: "Bengaluru",
};

const page: BoardPostPage = {
  token: "t".repeat(24),
  today: "2026-11-24",
  post: {
    ...fields,
    id: "00000000-0000-4000-8000-000000000001",
    status: "open",
    closed_by: null,
    is_demo: false,
    created_at: 1,
    updated_at: 1,
  },
  interests: [],
};

function fakeApi(failOnce: string[] = []) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const api: Pick<Api, "send"> = {
    async send(_method, path, body, schema) {
      calls.push({ path, body: body as Record<string, unknown> });
      const at = failOnce.indexOf(path);
      if (at !== -1) {
        failOnce.splice(at, 1);
        throw new Error("network");
      }
      const answers: Record<string, unknown> = {
        "/api/board-posts/email/start": {
          prototype: true,
          code: "111111",
          expires_at: 1,
        },
        "/api/verify/start": { prototype: true, code: "222222", expires_at: 1 },
        "/api/board-posts/email/check": {
          proof: "e".repeat(43),
          expires_at: 9e15,
        },
        "/api/verify/check": {
          purpose: "order",
          proof: "p".repeat(43),
          expires_at: 9e15,
        },
        "/api/board-posts": page,
      };
      return schema.parse(answers[path]);
    },
  };
  return { api, calls };
}

const answer = {
  email: "Buyer@Acme.in",
  phone: "98765 43210",
  emailCode: "111111",
  phoneCode: "222222",
};

test("both codes, then the post with both proofs", async () => {
  const { api, calls } = fakeApi();
  const flow = createBoardFlow({ api });
  const codes = await flow.getCodes(answer.email, answer.phone);
  assert.equal(codes.email, "buyer@acme.in");
  assert.equal(codes.phone, "+919876543210");
  assert.equal(codes.emailCode.code, "111111");
  const posted = await flow.post(fields, answer, "en");
  assert.equal(posted.token, page.token);
  const last = calls.at(-1)?.body;
  assert.equal(last?.proof, "p".repeat(43));
  assert.equal(last?.email_proof, "e".repeat(43));
  assert.equal(last?.language, "en");
  assert.equal(last?.description, fields.description);
});

test("a retry after a failed post reuses both proofs", async () => {
  const { api, calls } = fakeApi(["/api/board-posts"]);
  const flow = createBoardFlow({ api });
  await flow.getCodes(answer.email, answer.phone);
  await assert.rejects(flow.post(fields, answer, "en"));
  await flow.post(fields, answer, "en");
  assert.deepEqual(
    calls.map(({ path }) => path).filter((path) => path.endsWith("/check")),
    ["/api/board-posts/email/check", "/api/verify/check"],
  );
});

test("a new email or number drops the codes", async () => {
  const { api } = fakeApi();
  const flow = createBoardFlow({ api });
  await flow.getCodes(answer.email, answer.phone);
  assert.equal(flow.changed(" buyer@acme.in", "+91 98765 43210"), false);
  assert.equal(flow.changed("other@acme.in", answer.phone), true);
  assert.equal(flow.codes, undefined);
  assert.equal(flow.changed("other@acme.in", answer.phone), false);
});
