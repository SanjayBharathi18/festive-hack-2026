import {
  boardPostFieldsSchema,
  boardUnitSchema,
  type BoardPost,
  type BoardPostFields,
} from "../../shared/bulk.ts";

export type BoardFormValues = {
  company: string;
  description: string;
  items: { name: string; quantity: string; unit: string }[];
  needBy: string;
  places: string[];
  budget: string;
  city: string;
};

export type BoardFormProblem =
  "description" | "items" | "need_by" | "places" | "budget" | "city";

export type BoardFormResult =
  | { ok: true; fields: BoardPostFields }
  | { ok: false; problem: BoardFormProblem };

// The fields of a board post from the form, or the first problem in the
// order of the form. Empty item and place rows are left out; the budget is
// in rupees on the form and in paise in the post.
export function readBoardForm(
  values: BoardFormValues,
  today: string,
): BoardFormResult {
  if (values.description.trim() === "")
    return { ok: false, problem: "description" };
  const rows = values.items.filter(
    ({ name, quantity }) => name.trim() !== "" || quantity.trim() !== "",
  );
  const items = rows.map(({ name, quantity, unit }) => ({
    name: name.trim(),
    quantity: Number(quantity),
    unit: boardUnitSchema.safeParse(unit).data ?? "pieces",
  }));
  if (
    items.length === 0 ||
    items.some(
      ({ name, quantity }) =>
        name === "" || !Number.isInteger(quantity) || quantity < 1,
    )
  ) {
    return { ok: false, problem: "items" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.needBy) || values.needBy < today) {
    return { ok: false, problem: "need_by" };
  }
  const places = values.places.map((place) => place.trim()).filter(Boolean);
  if (places.length === 0) return { ok: false, problem: "places" };
  const rupees = values.budget.trim();
  const budget = rupees === "" ? null : Number(rupees);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    return { ok: false, problem: "budget" };
  }
  if (values.city.trim() === "") return { ok: false, problem: "city" };
  const parsed = boardPostFieldsSchema.safeParse({
    company_name: values.company.trim() === "" ? null : values.company,
    description: values.description,
    items,
    need_by: values.needBy,
    places,
    budget_per_unit: budget === null ? null : Math.round(budget * 100),
    city: values.city,
  });
  return parsed.success
    ? { ok: true, fields: parsed.data }
    : { ok: false, problem: firstProblem(parsed.error.issues[0]?.path[0]) };
}

export function formValuesOf(post: BoardPost): BoardFormValues {
  return {
    company: post.company_name ?? "",
    description: post.description,
    items: post.items.map(({ name, quantity, unit }) => ({
      name,
      quantity: String(quantity),
      unit,
    })),
    needBy: post.need_by,
    places: [...post.places],
    budget:
      post.budget_per_unit === null ? "" : String(post.budget_per_unit / 100),
    city: post.city,
  };
}

function firstProblem(field: PropertyKey | undefined): BoardFormProblem {
  switch (field) {
    case "items":
    case "places":
    case "city":
      return field;
    case "need_by":
      return "need_by";
    case "budget_per_unit":
      return "budget";
    default:
      return "description";
  }
}
