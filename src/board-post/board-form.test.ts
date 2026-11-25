import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardPost } from "../../shared/bulk.ts";
import {
  formValuesOf,
  readBoardForm,
  type BoardFormValues,
} from "./board-form.ts";

const today = "2026-11-24";

const values: BoardFormValues = {
  company: "  ",
  description: "A tech company in Whitefield",
  items: [
    { name: "Kaju katli", quantity: "1000", unit: "pieces" },
    { name: "", quantity: "", unit: "pieces" },
    { name: "Diwali assorted box (500 g)", quantity: "500", unit: "boxes" },
  ],
  needBy: "2026-12-04",
  places: ["Whitefield office", " ", "Bellandur office"],
  budget: "250",
  city: "Bengaluru",
};

test("the form gives the fields of the post, without empty rows", () => {
  const result = readBoardForm(values, today);
  assert.ok(result.ok);
  assert.deepEqual(result.fields, {
    company_name: null,
    description: "A tech company in Whitefield",
    items: [
      { name: "Kaju katli", quantity: 1000, unit: "pieces" },
      { name: "Diwali assorted box (500 g)", quantity: 500, unit: "boxes" },
    ],
    need_by: "2026-12-04",
    places: ["Whitefield office", "Bellandur office"],
    budget_per_unit: 25_000,
    city: "Bengaluru",
  });
});

test("each problem comes in the order of the form", () => {
  const cases: [Partial<BoardFormValues>, string][] = [
    [{ description: " " }, "description"],
    [{ items: [] }, "items"],
    [{ items: [{ name: "Laddu", quantity: "0", unit: "pieces" }] }, "items"],
    [{ items: [{ name: "", quantity: "50", unit: "kg" }] }, "items"],
    [{ needBy: "" }, "need_by"],
    [{ needBy: "2026-11-20" }, "need_by"],
    [{ places: [" "] }, "places"],
    [{ budget: "-5" }, "budget"],
    [{ city: "" }, "city"],
  ];
  for (const [change, problem] of cases) {
    const result = readBoardForm({ ...values, ...change }, today);
    assert.deepEqual(result, { ok: false, problem }, JSON.stringify(change));
  }
});

test("no budget is null, and a post fills the form back", () => {
  const result = readBoardForm(
    { ...values, budget: "", company: "Acme" },
    today,
  );
  assert.ok(result.ok);
  assert.equal(result.fields.budget_per_unit, null);
  const post: BoardPost = {
    ...result.fields,
    id: "00000000-0000-4000-8000-000000000001",
    status: "open",
    closed_by: null,
    is_demo: false,
    created_at: 1,
    updated_at: 1,
  };
  const back = formValuesOf({ ...post, budget_per_unit: 25_050 });
  assert.equal(back.company, "Acme");
  assert.equal(back.budget, "250.5");
  assert.deepEqual(back.items[0], {
    name: "Kaju katli",
    quantity: "1000",
    unit: "pieces",
  });
  assert.deepEqual(readBoardForm(back, today).ok, true);
});
