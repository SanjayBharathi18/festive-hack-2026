import {
  packageInputSchema,
  sameName,
  serviceStyleSchema,
  type CateringPackage,
  type PackageInput,
  type ServiceStyle,
} from "../../shared/catering.ts";
import { vegMarkSchema, type VegMark } from "../../shared/model.ts";
import type { Text, TextKey } from "../text/text.ts";

export type DishValues = { name: string; mark: string; jain: boolean };
export type CategoryValues = {
  name: string;
  min: string;
  max: string;
  dishes: DishValues[];
};
export type PackageValues = {
  kind: string;
  name: string;
  price: string;
  onRequest: boolean;
  minCount: string;
  freeChoice: boolean;
  maxTotal: string;
  styles: string[];
  staffExtra: string;
  countersExtra: string;
  categories: CategoryValues[];
};

export type PackageProblem =
  | "name"
  | "price"
  | "min_count"
  | "styles"
  | "extra"
  | "category"
  | "limits"
  | "total"
  | "names"
  | "jain";

// Where a problem is, for its words and for the focus: a field of the
// package, or a field of a category by its place on the form, and of one of
// its dishes.
export type ProblemPlace =
  | {
      field:
        | "name"
        | "price"
        | "min_count"
        | "styles"
        | "staff_extra"
        | "counters_extra"
        | "max_total";
    }
  | {
      category: number;
      field: "name" | "min" | "max" | "dish" | "mark";
      dish?: number;
    };

// The most that a service style adds to a plate or guest, in rupees.
const maxExtra = 10_000;

export type PackageFormResult =
  | { ok: true; input: PackageInput }
  | { ok: false; problem: PackageProblem; at: ProblemPlace };

// The package from the editor, or the first problem in the order of the
// form. Empty dish rows are left out; prices are in rupees on the form.
export function readPackageForm(values: PackageValues): PackageFormResult {
  if (values.name.trim() === "") return problem("name", { field: "name" });
  const price = values.onRequest ? null : wholeOrNull(values.price);
  if (!values.onRequest && !(price !== null && price >= 0)) {
    return problem("price", { field: "price" });
  }
  const minCount = wholeOrNull(values.minCount);
  if (minCount === null || !(minCount >= 1)) {
    return problem("min_count", { field: "min_count" });
  }
  const styles = values.styles.flatMap((style) => {
    const parsed = serviceStyleSchema.safeParse(style);
    return parsed.success ? [parsed.data] : [];
  });
  if (styles.length === 0) return problem("styles", { field: "styles" });
  // A style that the package does not offer adds nothing.
  const extra = (style: ServiceStyle, value: string) =>
    styles.includes(style) ? (wholeOrNull(value) ?? 0) : 0;
  const staffExtra = extra("staff", values.staffExtra);
  if (!(staffExtra >= 0 && staffExtra <= maxExtra)) {
    return problem("extra", { field: "staff_extra" });
  }
  const countersExtra = extra("live_counters", values.countersExtra);
  if (!(countersExtra >= 0 && countersExtra <= maxExtra)) {
    return problem("extra", { field: "counters_extra" });
  }
  const filled = values.categories
    .map((category, index) => ({
      category,
      index,
      dishes: category.dishes
        .map((dish, at) => ({ ...dish, at }))
        .filter(({ name }) => name.trim() !== ""),
    }))
    .filter(
      ({ category, dishes }) =>
        category.name.trim() !== "" || dishes.length > 0,
    );
  if (filled.length === 0) {
    return problem("category", { category: 0, field: "name" });
  }
  const read = [];
  const seen = new Set<string>();
  for (const { category, index, dishes: rows } of filled) {
    if (category.name.trim() === "") {
      return problem("category", { category: index, field: "name" });
    }
    if (rows.length === 0) {
      return problem("category", { category: index, field: "dish", dish: 0 });
    }
    const min = values.freeChoice ? 0 : (wholeOrNull(category.min) ?? 0);
    const max = values.freeChoice ? null : wholeOrNull(category.max);
    if (!(min >= 0 && min <= rows.length)) {
      return problem("limits", { category: index, field: "min" });
    }
    if (max !== null && !(max >= 1 && max >= min)) {
      return problem("limits", { category: index, field: "max" });
    }
    const jain = rows.find(
      ({ mark, jain: isJain }) => isJain && markOf(mark) !== "veg",
    );
    if (jain !== undefined) {
      return problem("jain", { category: index, field: "mark", dish: jain.at });
    }
    const names = new Set<string>();
    for (const { name, at } of rows) {
      if (names.has(sameName(name))) {
        return problem("names", { category: index, field: "dish", dish: at });
      }
      names.add(sameName(name));
    }
    if (seen.has(sameName(category.name))) {
      return problem("names", { category: index, field: "name" });
    }
    seen.add(sameName(category.name));
    read.push({
      name: category.name.trim(),
      min,
      max,
      dishes: rows.map(({ name, mark, jain: isJain }) => ({
        name: name.trim(),
        veg_mark: markOf(mark),
        jain: isJain,
      })),
    });
  }
  const maxTotal = values.freeChoice ? null : wholeOrNull(values.maxTotal);
  if (
    maxTotal !== null &&
    !(maxTotal >= 1 && maxTotal >= read.reduce((sum, { min }) => sum + min, 0))
  ) {
    return problem("total", { field: "max_total" });
  }
  const parsed = packageInputSchema.safeParse({
    kind: values.kind === "buffet" ? "buffet" : "plate",
    name: values.name,
    price: price === null ? null : price * 100,
    min_count: minCount,
    free_choice: values.freeChoice,
    max_total: maxTotal,
    service_styles: [...new Set<ServiceStyle>(styles)],
    style_extras: {
      staff: staffExtra * 100,
      live_counters: countersExtra * 100,
    },
    categories: read,
  });
  return parsed.success
    ? { ok: true, input: parsed.data }
    : problem("limits", { category: 0, field: "min" });
}

// The words of a problem: a problem in a category names it, by its name or
// by its place on the form.
export function problemWords(
  result: Extract<PackageFormResult, { ok: false }>,
  values: Pick<PackageValues, "categories">,
  text: Pick<Text, "t">,
): string {
  const { problem: kind, at } = result;
  if (!("category" in at) || values.categories.length === 0) {
    return text.t(`catering.editor.problem.${kind}`);
  }
  const name = values.categories[at.category]?.name.trim() ?? "";
  const category =
    name === ""
      ? text.t("catering.editor.category_number", { number: at.category + 1 })
      : name;
  const key = categoryKey(kind, at.field);
  return key === undefined
    ? text.t(`catering.editor.problem.${kind}`)
    : text.t(key, { category });
}

export function valuesOfPackage(pkg: CateringPackage): PackageValues {
  return {
    kind: pkg.kind,
    name: pkg.name,
    price: pkg.price === null ? "" : String(pkg.price / 100),
    onRequest: pkg.price === null,
    minCount: String(pkg.min_count),
    freeChoice: pkg.free_choice,
    maxTotal: pkg.max_total === null ? "" : String(pkg.max_total),
    styles: [...pkg.service_styles],
    staffExtra: rupeesOrEmpty(pkg.style_extras.staff),
    countersExtra: rupeesOrEmpty(pkg.style_extras.live_counters),
    categories: pkg.categories.map(({ name, min, max, dishes }) => ({
      name,
      min: String(min),
      max: max === null ? "" : String(max),
      dishes: dishes.map(({ name: dish, veg_mark, jain }) => ({
        name: dish,
        mark: veg_mark,
        jain,
      })),
    })),
  };
}

export function emptyPackage(): PackageValues {
  return {
    kind: "plate",
    name: "",
    price: "",
    onRequest: false,
    minCount: "",
    freeChoice: false,
    maxTotal: "",
    styles: ["delivery"],
    staffExtra: "",
    countersExtra: "",
    categories: [
      {
        name: "",
        min: "1",
        max: "",
        dishes: [{ name: "", mark: "veg", jain: false }],
      },
    ],
  };
}

function categoryKey(
  kind: PackageProblem,
  field: ProblemPlace["field"],
): TextKey | undefined {
  switch (kind) {
    case "category":
      return field === "name"
        ? "catering.editor.problem_in.category_name"
        : "catering.editor.problem_in.category_dish";
    case "names":
      return field === "name"
        ? "catering.editor.problem_in.category_names"
        : "catering.editor.problem_in.names";
    case "limits":
      return "catering.editor.problem_in.limits";
    case "jain":
      return "catering.editor.problem_in.jain";
    default:
      return undefined;
  }
}

function problem(name: PackageProblem, at: ProblemPlace): PackageFormResult {
  return { ok: false, problem: name, at };
}

// An extra of 0 shows as an empty field.
function rupeesOrEmpty(paise: number): string {
  return paise === 0 ? "" : String(paise / 100);
}

function wholeOrNull(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : Number.NaN;
}

function markOf(mark: string): VegMark {
  return vegMarkSchema.safeParse(mark).data ?? "veg";
}
