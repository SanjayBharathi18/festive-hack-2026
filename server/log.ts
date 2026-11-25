import type { Clock } from "./clock.ts";

export type Log = (fields: Record<string, unknown>) => void;

export function createLog(write: (line: string) => void, clock: Clock): Log {
  return (fields) =>
    write(
      JSON.stringify({ time: new Date(clock.now()).toISOString(), ...fields }),
    );
}
