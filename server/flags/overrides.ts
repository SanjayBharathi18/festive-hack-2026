import type { Flags, OrderFlags } from "./decisions.ts";

export type SegmentOverride = Partial<
  Pick<OrderFlags, "ops_reading" | "cfg_sarvam">
>;

export type FlagOverrides = ReturnType<typeof createFlagOverrides>;

// In-memory segment overrides on top of any Flags, for the /ops demo when no
// Flagsmith project can take the change. They keep the Flags contract, so the
// pipeline cannot tell them from a Flagsmith segment override.
export function createFlagOverrides(base: Flags) {
  const overrides = new Map<string, SegmentOverride>();
  const flags: Flags = {
    ...base,
    forOrder: async (orderId, traits, signal) =>
      applyOverride(await base.forOrder(orderId, traits, signal), overrides),
  };
  return {
    flags,
    set: (segment: string, values: SegmentOverride): void => {
      overrides.set(segment, { ...overrides.get(segment), ...values });
    },
    remove: (segment: string, names: readonly (keyof SegmentOverride)[]) => {
      const current = overrides.get(segment);
      if (current === undefined) return;
      const rest = Object.fromEntries(
        Object.entries(current).filter(
          ([name]) => !names.includes(name as keyof SegmentOverride),
        ),
      );
      if (Object.keys(rest).length === 0) overrides.delete(segment);
      else overrides.set(segment, rest);
    },
    get: (segment: string): SegmentOverride =>
      structuredClone(overrides.get(segment) ?? {}),
  };
}

export function applyOverride(
  decision: OrderFlags,
  overrides: ReadonlyMap<string, SegmentOverride>,
): OrderFlags {
  const override =
    decision.segment === null ? undefined : overrides.get(decision.segment);
  return override === undefined ? decision : { ...decision, ...override };
}
