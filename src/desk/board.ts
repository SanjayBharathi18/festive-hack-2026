import type { Day } from "../../shared/day.ts";
import type { LimitUnit } from "../../shared/model.ts";
import type { DeskBoard, DeskSlip } from "../../shared/orders.ts";
import { addsLoad, dayLoad, spaceLeft } from "./load.ts";

export type BoardDay = {
  day: Day;
  past: boolean;
  load: number;
  spaceLeft: number | null;
  slips: DeskSlip[];
};

export type Board = {
  readonly today: Day | undefined;
  readonly unit: LimitUnit;
  readonly limit: number | null;
  load(answer: DeskBoard): void;
  put(slip: DeskSlip): void;
  // A desk order that she took back with Undo leaves the board, and a late
  // event about it does not bring it back.
  remove(id: string): void;
  get(id: string): DeskSlip | undefined;
  days(): BoardDay[];
  dayOf(day: Day): BoardDay | undefined;
  subscribe(listener: () => void): () => void;
};

// The slips of her days. The page writes each change here, from her hand,
// from the server's answers and from the live events, and draws from it.
export function createBoard({
  unit,
  limit,
}: {
  unit: LimitUnit;
  limit: number | null;
}): Board {
  const slips = new Map<string, DeskSlip>();
  const removed = new Set<string>();
  const listeners = new Set<() => void>();
  let today: Day | undefined;
  let rules = { unit, limit };
  const emit = () => {
    for (const listener of listeners) listener();
  };

  const days = (): BoardDay[] =>
    groupDays([...slips.values()], today, rules.unit, rules.limit);

  return {
    get today() {
      return today;
    },
    get unit() {
      return rules.unit;
    },
    get limit() {
      return rules.limit;
    },
    load(answer) {
      today = answer.today;
      rules = { unit: answer.limit_unit, limit: answer.daily_limit };
      slips.clear();
      for (const { slips: daySlips } of answer.days) {
        for (const slip of daySlips) {
          if (!removed.has(slip.id)) slips.set(slip.id, slip);
        }
      }
      emit();
    },
    put(slip) {
      if (slips.get(slip.id) === slip || removed.has(slip.id)) return;
      slips.set(slip.id, slip);
      emit();
    },
    remove(id) {
      removed.add(id);
      if (slips.delete(id)) emit();
    },
    get: (id) => slips.get(id),
    days,
    dayOf: (day) => days().find((entry) => entry.day === day),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function groupDays(
  slips: readonly DeskSlip[],
  today: Day | undefined,
  unit: LimitUnit,
  limit: number | null,
): BoardDay[] {
  const byDay = new Map<Day, DeskSlip[]>();
  for (const slip of slips) {
    const list = byDay.get(slip.day) ?? [];
    list.push(slip);
    byDay.set(slip.day, list);
  }
  return [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, daySlips]) => {
      const load = dayLoad(unit, daySlips);
      return {
        day,
        past: today !== undefined && day < today,
        load,
        spaceLeft: spaceLeft(limit, load),
        slips: daySlips.toSorted(bySlipOrder),
      };
    });
}

// Open orders first, in the order they came; cancelled and expired ones last.
function bySlipOrder(a: DeskSlip, b: DeskSlip): number {
  const closed = Number(!addsLoad(a.status)) - Number(!addsLoad(b.status));
  return closed !== 0 ? closed : a.number - b.number;
}
