const clock = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function clockTime(ms: number): string {
  return clock.format(ms);
}

export function wholeNumber(value: number): string {
  return whole.format(value);
}

export function unitsNumber(value: number): string {
  return tenths.format(value);
}
