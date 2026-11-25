import type { SearchAnswer, SearchStore } from "../../shared/search.ts";

export type SortNote =
  "search.sort.centre" | "search.sort.no_centre" | "search.sort.new_last";

// The line under Sort when the order needs words: Nearest with no location
// measures from the centre of the city (or, with no centre, cannot measure),
// and Best rated puts the new cooks, with no rating yet, after the rated
// ones.
export function sortNote(
  answer: Pick<SearchAnswer, "sort" | "distance_from" | "city"> & {
    stores: readonly Pick<SearchStore, "rating">[];
  },
): SortNote | null {
  if (answer.sort === "distance") {
    if (answer.distance_from === "buyer") return null;
    return answer.distance_from === "centre" && answer.city !== null
      ? "search.sort.centre"
      : "search.sort.no_centre";
  }
  return answer.stores.some(({ rating }) => rating === null)
    ? "search.sort.new_last"
    : null;
}
