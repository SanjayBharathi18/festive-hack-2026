import { orderIdentity, type Flags } from "./decisions.ts";

export type ExperimentCounts = {
  exposures: ReadonlyMap<string, number>;
  conversions: ReadonlyMap<string, number>;
  outside: number;
};

export type ExperimentTally = ReturnType<typeof createExperimentTally>;

export const rememberedOrders = 10_000;

// Counts the experiment exposures and conversion events that this server
// records, by variant key, for the developer console. It passes each call on
// unchanged, so Flagsmith still keeps the real results. A conversion of an
// order with no exposure since the start counts as outside the experiment.
export function createExperimentTally(base: Flags) {
  const variantOf = new Map<string, string>();
  const exposures = new Map<string, number>();
  const conversions = new Map<string, number>();
  let outside = 0;
  const flags: Flags = {
    ...base,
    recordExposure: (decision) => {
      base.recordExposure(decision);
      const { experiment } = decision;
      if (!decision.in_experiment || experiment === undefined) return;
      add(exposures, experiment.variant);
      variantOf.delete(decision.identity);
      variantOf.set(decision.identity, experiment.variant);
      for (const identity of variantOf.keys()) {
        if (variantOf.size <= rememberedOrders) break;
        variantOf.delete(identity);
      }
    },
    recordConversion: (orderId) => {
      base.recordConversion(orderId);
      const variant = variantOf.get(orderIdentity(orderId));
      if (variant === undefined) outside += 1;
      else add(conversions, variant);
    },
  };
  return {
    flags,
    counts: (): ExperimentCounts => ({
      exposures: new Map(exposures),
      conversions: new Map(conversions),
      outside,
    }),
  };
}

function add(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
