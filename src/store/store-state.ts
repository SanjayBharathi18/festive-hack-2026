import type { Day } from "../../shared/day.ts";
import type { CartReading } from "../../shared/reading.ts";
import type { DaysResponse, Pack } from "../../shared/store.ts";
import {
  cartCount,
  maxLines,
  maxQuantity,
  quantityOf,
  setQuantity,
  withDay,
  type Cart,
} from "../cart/cart.ts";
import type { CartStorage } from "../cart/cart-storage.ts";
import { resolveDay, type ResolvedDay } from "./day-choice.ts";
import {
  applyReading,
  type AppliedReading,
  type VoiceMark,
} from "./voice-result.ts";

export type StoreChange = { cart: boolean; days: boolean };
export type Step = { more: boolean; first: boolean };

export type StoreState = {
  readonly cart: Cart;
  readonly marks: ReadonlyMap<string, VoiceMark>;
  readonly days: DaysResponse | undefined;
  readonly resolved: ResolvedDay;
  readonly canUndoReading: boolean;
  canStep(packId: string, delta: 1 | -1): boolean;
  step(pack: Pick<Pack, "id" | "price">, delta: 1 | -1): Step;
  pickDay(day: Day): void;
  applyReading(reading: CartReading): AppliedReading;
  undoReading(): void;
  setDays(days: DaysResponse): void;
};

// The cart of one store page. Each change by the buyer is saved on the phone
// at once; loading the page saves nothing, so a prerender has no side effect.
export function createStoreState({
  slug,
  storage,
  cart,
  nextFreeDay,
  onChange,
}: {
  slug: string;
  storage: Pick<CartStorage, "save">;
  cart: Cart;
  nextFreeDay: Day | null;
  onChange: (change: StoreChange) => void;
}): StoreState {
  let current = cart;
  let marks = new Map<string, VoiceMark>();
  let days: DaysResponse | undefined;
  let beforeReading: { cart: Cart; marks: Map<string, VoiceMark> } | undefined;

  const change = (next: Cart) => {
    current = next;
    storage.save(slug, current);
    onChange({ cart: true, days: false });
  };
  const canStep = (packId: string, delta: 1 | -1) => {
    const quantity = quantityOf(current, packId);
    if (delta === -1) return quantity > 0;
    return quantity > 0
      ? quantity < maxQuantity
      : current.lines.length < maxLines;
  };

  return {
    get cart() {
      return current;
    },
    get marks() {
      return marks;
    },
    get days() {
      return days;
    },
    get resolved() {
      if (days !== undefined) return resolveDay(current, days);
      return {
        day: current.picked_by === null ? nextFreeDay : current.day,
        missed: null,
      };
    },
    get canUndoReading() {
      return beforeReading !== undefined;
    },
    canStep,
    step(pack, delta) {
      if (!canStep(pack.id, delta)) return { more: false, first: false };
      const wasEmpty = cartCount(current) === 0;
      if (marks.has(pack.id)) {
        marks = new Map(marks);
        marks.delete(pack.id);
      }
      beforeReading = undefined;
      change(setQuantity(current, pack, quantityOf(current, pack.id) + delta));
      return { more: canStep(pack.id, delta), first: wasEmpty && delta === 1 };
    },
    pickDay(day) {
      if (current.day === day && current.picked_by === "buyer") return;
      beforeReading = undefined;
      change(withDay(current, day, "buyer"));
    },
    applyReading(reading) {
      const applied = applyReading(current, reading);
      beforeReading = { cart: current, marks };
      marks = new Map([...marks, ...applied.marks]);
      change(applied.cart);
      return applied;
    },
    undoReading() {
      if (beforeReading === undefined) return;
      marks = beforeReading.marks;
      const previous = beforeReading.cart;
      beforeReading = undefined;
      change(previous);
    },
    setDays(next) {
      days = next;
      onChange({ cart: false, days: true });
    },
  };
}
