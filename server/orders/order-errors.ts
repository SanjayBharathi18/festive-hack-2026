import type { Day } from "../../shared/day.ts";
import type { DayWarning } from "../../shared/orders.ts";
import { appError, type AppError } from "../http/errors.ts";
import { dayText } from "../messages/templates.ts";
import type { CartProblem } from "./cart.ts";

export function cartError(problem: CartProblem): AppError {
  switch (problem.kind) {
    case "unavailable":
      return appError(
        409,
        "item_unavailable",
        "An item in the cart is no longer on the menu. Remove it, then order again.",
      );
    case "sold_out":
      return appError(
        409,
        "item_sold_out",
        `${problem.name} is sold out. Remove it from the cart, then order again.`,
      );
    case "price_changed":
      return appError(
        409,
        "price_changed",
        `The price of ${problem.name} has changed. Check the new total, then order again.`,
      );
  }
}

export function dayError(warning: DayWarning): AppError {
  const day = dayText(warning.day, "en");
  const next =
    warning.next_free_day === null
      ? "Pick another day."
      : `The next day with space is ${dayText(warning.next_free_day, "en")}.`;
  return warning.reason === "full" || warning.reason === "not_enough_space"
    ? appError(409, "day_full", `${day} is full. ${next}`)
    : appError(
        409,
        "day_closed",
        `The store does not take orders for ${day}. ${next}`,
      );
}

export function farDayError(lastDay: Day): AppError {
  return appError(
    400,
    "day_too_far",
    `This day is too far ahead. Pick a day up to ${dayText(lastDay, "en")}.`,
  );
}

export function pastDayError(): AppError {
  return appError(
    400,
    "day_past",
    "This day has passed. Pick today or a later day.",
  );
}
