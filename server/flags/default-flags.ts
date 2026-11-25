import {
  flagDefaults,
  orderIdentity,
  segmentFor,
  type FlagValues,
  type Flags,
  type OrderFlags,
} from "./decisions.ts";

export type DefaultFlags = Flags & {
  exposures: string[];
  conversions: string[];
};

export function createDefaultFlags(
  overrides: Partial<FlagValues> = {},
): DefaultFlags {
  const values: FlagValues = { ...flagDefaults, ...overrides };
  const exposures: string[] = [];
  const conversions: string[] = [];
  return {
    exposures,
    conversions,
    environment: async () => values,
    forOrder: async (orderId, traits): Promise<OrderFlags> => ({
      identity: orderIdentity(orderId),
      ops_reading: values.ops_reading,
      cfg_sarvam: values.cfg_sarvam,
      exp_reading_path: values.exp_reading_path,
      in_experiment: false,
      cfg_demo_trace: values.cfg_demo_trace,
      segment: segmentFor(traits.language),
      from: "defaults",
    }),
    recordExposure: (decision) => void exposures.push(decision.identity),
    recordConversion: (orderId) =>
      void conversions.push(orderIdentity(orderId)),
    close: async () => {},
  };
}
