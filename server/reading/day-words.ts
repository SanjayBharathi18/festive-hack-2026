import { addDays, daySchema, weekday, type Day } from "../../shared/day.ts";

export const weekdayNames = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const dayWords = [
  "none",
  "today",
  "tomorrow",
  "day_after_tomorrow",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "next_monday",
  "next_tuesday",
  "next_wednesday",
  "next_thursday",
  "next_friday",
  "next_saturday",
  "next_sunday",
  "date",
] as const;
export type DayWord = (typeof dayWords)[number];

export function resolveDay(
  today: Day,
  word: DayWord,
  date: string | null,
): Day | null {
  switch (word) {
    case "none":
      return null;
    case "today":
      return today;
    case "tomorrow":
      return addDays(today, 1);
    case "day_after_tomorrow":
      return addDays(today, 2);
    case "date":
      return date !== null && daySchema.safeParse(date).success && date >= today
        ? date
        : null;
    default: {
      const nextWeek = word.startsWith("next_");
      const target = (weekdayNames as readonly string[]).indexOf(
        word.replace(/^next_/, ""),
      );
      if (!nextWeek) {
        return addDays(today, ((target - weekday(today) + 6) % 7) + 1);
      }
      const nextMonday = addDays(today, 7 - mondayIndex(weekday(today)));
      return addDays(nextMonday, mondayIndex(target));
    }
  }
}

function mondayIndex(sundayIndex: number): number {
  return (sundayIndex + 6) % 7;
}
