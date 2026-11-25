const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const grams = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const kilograms = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function formatMoney(paise: number): string {
  return rupees.format(paise / 100);
}

export function formatWeight(weightGrams: number): string {
  return weightGrams < 1000
    ? `${grams.format(weightGrams)} g`
    : `${kilograms.format(weightGrams / 1000)} kg`;
}

export function formatTimer(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
