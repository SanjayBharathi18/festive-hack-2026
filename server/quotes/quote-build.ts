import type { z } from "zod";
import type { BoardPost, BulkItem, DeskInterest } from "../../shared/bulk.ts";
import {
  planEstimate,
  sameName,
  styleExtra,
  type CateringPackage,
} from "../../shared/catering.ts";
import type { Day } from "../../shared/day.ts";
import type {
  BoardPostQuotePayload,
  BulkQuotePayload,
  CateringQuotePayload,
  quoteInputSchema,
} from "../../shared/quotes.ts";
import { shownCompany } from "../bulk/board-data.ts";
import { checkPlan } from "../catering/plate-rules.ts";
import { appError } from "../http/errors.ts";

type Input = z.output<typeof quoteInputSchema>;
export type BulkInput = Extract<Input, { kind: "bulk" }>;
export type CateringInput = Extract<Input, { kind: "catering" }>;
export type BoardPostInput = Extract<Input, { kind: "board_post" }>;

// The request as the desk shows it, from her own bulk items: each line names
// one of them once, with at least its minimum quantity.
export function bulkPayload(
  items: readonly BulkItem[],
  input: BulkInput,
  today: Day,
): BulkQuotePayload {
  const ids = new Set(input.lines.map(({ item_id }) => item_id));
  if (ids.size !== input.lines.length) {
    throw appError(
      400,
      "invalid_input",
      "Each bulk item comes once in a request. Add up its quantities.",
    );
  }
  if (input.need_by !== null && input.need_by < today) {
    throw appError(400, "day_past", "This day has passed. Choose a later day.");
  }
  const lines = input.lines.map(({ item_id, quantity }) => {
    const item = items.find(({ id }) => id === item_id);
    if (item === undefined) {
      throw appError(
        409,
        "item_unavailable",
        "An item is no longer in the bulk section of this store. Remove it, then send the request again.",
      );
    }
    if (quantity < item.min_qty) {
      throw appError(
        400,
        "invalid_input",
        `${item.name} starts at ${item.min_qty} ${item.unit}. Raise the quantity.`,
      );
    }
    return {
      item_id,
      name: item.name,
      quantity,
      unit: item.unit,
      price: item.price,
    };
  });
  return {
    kind: "bulk",
    lines,
    estimate: lines.every(({ price }) => price !== null)
      ? lines.reduce(
          (sum, { price, quantity }) => sum + (price ?? 0) * quantity,
          0,
        )
      : null,
    need_by: input.need_by,
    place: input.place,
    note: input.note,
  };
}

// A plan that keeps the plate rules, for enough guests, on a day that is
// not past and not booked, with a service style of the package. The
// estimate adds the extra of the service style to each plate or guest.
export function cateringPayload(
  pkg: CateringPackage,
  input: CateringInput,
  { today, booked }: { today: Day; booked: ReadonlySet<Day> },
): CateringQuotePayload {
  const check = checkPlan(pkg, input.dishes);
  if (!check.ok) {
    throw appError(
      400,
      "invalid_input",
      `This plan does not keep the rules of the ${pkg.name}. Check the dishes of each category.`,
    );
  }
  const { event } = input;
  if (event.guests < pkg.min_count) {
    throw appError(
      400,
      "invalid_input",
      `The ${pkg.name} starts at ${pkg.min_count}. Raise the number of guests.`,
    );
  }
  if (event.date < today) {
    throw appError(
      400,
      "day_past",
      "This date has passed. Choose a later date.",
    );
  }
  if (booked.has(event.date)) {
    throw appError(
      409,
      "day_closed",
      "This caterer is booked on this date. Choose another date.",
    );
  }
  if (!pkg.service_styles.includes(event.service_style)) {
    throw appError(
      400,
      "invalid_input",
      `The ${pkg.name} does not offer this service. Choose another service style.`,
    );
  }
  const dishes = pkg.categories.flatMap(({ name, dishes: offered }) => {
    const names = offered
      .filter((dish) =>
        input.dishes.some(
          (pick) =>
            sameName(pick.category) === sameName(name) &&
            sameName(pick.dish) === sameName(dish.name),
        ),
      )
      .map((dish) => dish.name);
    return names.length === 0 ? [] : [{ category: name, names }];
  });
  return {
    kind: "catering",
    package: {
      id: pkg.id,
      name: pkg.name,
      kind: pkg.kind,
      price: pkg.price,
      min_count: pkg.min_count,
    },
    dishes,
    event,
    service_extra: styleExtra(pkg, event.service_style),
    estimate: planEstimate(pkg, event.guests, event.service_style),
    note: input.note,
  };
}

// The company contacts a store that answered its board post.
export function boardPostPayload(
  post: BoardPost,
  interest: DeskInterest | undefined,
  input: BoardPostInput,
): BoardPostQuotePayload {
  if (interest === undefined) {
    throw appError(
      404,
      "not_found",
      "This store did not answer this board post. Choose a store from its answers.",
    );
  }
  return {
    kind: "board_post",
    board_post_id: post.id,
    company: shownCompany(post),
    items: post.items,
    need_by: post.need_by,
    places: post.places,
    budget_per_unit: post.budget_per_unit,
    store_note: interest.note,
    note: input.note,
  };
}
