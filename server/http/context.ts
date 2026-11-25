import type { HttpBindings } from "@hono/node-server";

export type FlagVariants = Record<string, string>;

export type AppEnv = {
  Bindings: Partial<HttpBindings>;
  Variables: {
    requestId: string;
    flagVariants: FlagVariants;
    idempotencyScope?: string;
  };
};
