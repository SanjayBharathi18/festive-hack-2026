import { z } from "zod";

export const daySchema = z.iso.date();
export type Day = z.infer<typeof daySchema>;

const istOffsetMs = (5 * 60 + 30) * 60 * 1000;

export function istDay(instantMs: number): Day {
  return new Date(instantMs + istOffsetMs).toISOString().slice(0, 10);
}

export function addDays(day: Day, days: number): Day {
  const date = utcMidnight(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekday(day: Day): number {
  return utcMidnight(day).getUTCDay();
}

function utcMidnight(day: Day): Date {
  return new Date(`${day}T00:00:00Z`);
}
