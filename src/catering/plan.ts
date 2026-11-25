import {
  sameName,
  type CateringPackage,
  type PackageOffer,
  type PlanCheck,
  type PlanCheckAnswer,
  type PlanDish,
} from "../../shared/catering.ts";
import type { Day } from "../../shared/day.ts";

export type Refusal =
  | { kind: "category"; name: string; max: number }
  | { kind: "total"; max: number };

export type Refused = {
  pick: PlanDish;
  refusal: Refusal;
  fitting: readonly PackageOffer[];
};

// fitting: the other packages that allow the picks, from the last check.
export type PlanState = {
  readonly pkg: CateringPackage;
  readonly picks: readonly PlanDish[];
  readonly check: PlanCheck | undefined;
  readonly fitting: readonly PackageOffer[];
  readonly refused: Refused | undefined;
};

export type CheckPlan = (
  packageId: string,
  dishes: readonly PlanDish[],
  signal: AbortSignal,
) => Promise<PlanCheckAnswer>;

// What a tap on a dish did, for its sound: in, out, or refused by a limit.
export type ToggleOutcome = "added" | "dropped" | "refused";

export type Plan = {
  readonly state: PlanState;
  toggle(pick: PlanDish): Promise<ToggleOutcome>;
  switchTo(packageId: string, withRefused: boolean): Promise<void>;
  has(pick: PlanDish): boolean;
};

// The picks of the host for one package. The server keeps the plate rules:
// a pick that it refuses is not added, and the answer names the limit and
// the packages that allow it. A change of package keeps the picks that the
// new package has and checks them again: overLimits names what it breaks.
// Changes run one after the other. picks: the dishes of a kept plan; those
// that the package does not have are left out.
export function createPlan({
  packages,
  packageId,
  picks = [],
  check,
  onChange,
  signal,
}: {
  packages: readonly CateringPackage[];
  packageId: string;
  picks?: readonly PlanDish[];
  check: CheckPlan;
  onChange: (state: PlanState) => void;
  signal: AbortSignal;
}): Plan {
  const first = packageById(packages, packageId);
  let state: PlanState = {
    pkg: first,
    picks: picks.filter((pick) => offers(first, pick)),
    check: undefined,
    fitting: [],
    refused: undefined,
  };
  let queue: Promise<unknown> = Promise.resolve();

  const set = (next: Partial<PlanState>) => {
    state = { ...state, ...next };
    onChange(state);
  };

  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    queue = next.catch(() => {});
    return next;
  };

  const has = (pick: PlanDish) =>
    state.picks.some((entry) => samePick(entry, pick));

  return {
    get state() {
      return state;
    },
    has,
    toggle: (pick) =>
      run(async (): Promise<ToggleOutcome> => {
        if (has(pick)) {
          const kept = state.picks.filter((entry) => !samePick(entry, pick));
          set({ picks: kept, refused: undefined });
          const answer = await check(state.pkg.id, kept, signal);
          set({ check: answer.check, fitting: answer.fitting });
          return "dropped";
        }
        const proposed = [...state.picks, pick];
        const answer = await check(state.pkg.id, proposed, signal);
        const refusal = refusalOf(answer.check, pick);
        if (refusal === undefined) {
          set({
            picks: proposed,
            check: answer.check,
            fitting: answer.fitting,
            refused: undefined,
          });
          return "added";
        }
        set({ refused: { pick, refusal, fitting: answer.fitting } });
        return "refused";
      }),
    switchTo: (id, withRefused) =>
      run(async () => {
        const pkg = packageById(packages, id);
        const wanted =
          withRefused && state.refused !== undefined
            ? [...state.picks, state.refused.pick]
            : state.picks;
        const kept = wanted.filter((pick) => offers(pkg, pick));
        set({ pkg, picks: kept, refused: undefined, check: undefined });
        const answer = await check(pkg.id, kept, signal);
        set({ check: answer.check, fitting: answer.fitting });
      }),
  };
}

export function packageById(
  packages: readonly CateringPackage[],
  id: string,
): CateringPackage {
  const pkg = packages.find((entry) => entry.id === id);
  if (pkg === undefined) throw new Error(`No package has the id ${id}.`);
  return pkg;
}

// Why the rules refuse a pick: its category is over its maximum, or the plate
// is over its total. Another category that is over already, after a change
// of package, does not refuse it.
export function refusalOf(
  check: PlanCheck,
  pick: PlanDish,
): Refusal | undefined {
  const category = check.categories.find(
    ({ name }) => sameName(name) === sameName(pick.category),
  );
  if (category?.over === true && category.max !== null) {
    return { kind: "category", name: category.name, max: category.max };
  }
  if (check.total.over && check.total.max !== null) {
    return { kind: "total", max: check.total.max };
  }
  return undefined;
}

// The limits that the picks break, for example after a change to a smaller
// package: each category over its maximum, then the total.
export function overLimits(check: PlanCheck | undefined): Refusal[] {
  if (check === undefined) return [];
  const over: Refusal[] = check.categories.flatMap(
    ({ name, max, over: isOver }) =>
      isOver && max !== null ? [{ kind: "category" as const, name, max }] : [],
  );
  if (check.total.over && check.total.max !== null) {
    over.push({ kind: "total", max: check.total.max });
  }
  return over;
}

export function offers(pkg: CateringPackage, pick: PlanDish): boolean {
  return pkg.categories.some(
    ({ name, dishes }) =>
      sameName(name) === sameName(pick.category) &&
      dishes.some((dish) => sameName(dish.name) === sameName(pick.dish)),
  );
}

export function samePick(a: PlanDish, b: PlanDish): boolean {
  return (
    sameName(a.category) === sameName(b.category) &&
    sameName(a.dish) === sameName(b.dish)
  );
}

export type EventInput = {
  date: string;
  guests: number;
  place: string;
};

export type EventProblem =
  | "date_missing"
  | "date_past"
  | "date_booked"
  | "guests_missing"
  | "guests_below_min"
  | "place_missing";

// The first detail of the event that keeps the request back, in the order
// of the form.
export function eventProblem(
  { date, guests, place }: EventInput,
  {
    today,
    booked,
    minCount,
  }: { today: Day; booked: ReadonlySet<Day>; minCount: number },
): EventProblem | undefined {
  if (!Number.isInteger(guests) || guests < 1) return "guests_missing";
  if (guests < minCount) return "guests_below_min";
  if (date === "") return "date_missing";
  if (date < today) return "date_past";
  if (booked.has(date)) return "date_booked";
  if (place.trim() === "") return "place_missing";
  return undefined;
}

// The dishes still missing to meet each minimum, for the status line.
export function missingDishes(
  check: PlanCheck,
): { name: string; count: number }[] {
  return check.categories
    .filter(({ missing }) => missing > 0)
    .map(({ name, missing }) => ({ name, count: missing }));
}
