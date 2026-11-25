import type { ReadingItem, ReadingPack } from "./menu.ts";

let next = 0;

function id(): string {
  next += 1;
  return `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
}

function kiloPacks(perKilo: number, grams = [250, 500, 1000]): ReadingPack[] {
  return grams.map((size) => ({
    id: id(),
    label: size === 1000 ? "1 kg" : `${size} g`,
    grams: size,
    pieces: null,
    price: Math.round((perKilo * size) / 1000),
  }));
}

function item(
  name: string,
  name_latin: string,
  packs: ReadingPack[],
  sold_out = false,
): ReadingItem {
  return { id: id(), name, name_latin, sold_out, packs };
}

export const heroMenu = {
  mysorePak: item("ಮೈಸೂರು ಪಾಕ್", "Mysore pak", kiloPacks(88_000)),
  kajuKatli: item("ಕಾಜು ಕಟ್ಲಿ", "Kaju katli", kiloPacks(128_000)),
  besanLaddu: item("ಬೇಸನ್ ಲಡ್ಡು", "Besan laddu", kiloPacks(65_000)),
  kobbariMithai: item(
    "ಕೊಬ್ಬರಿ ಮಿಠಾಯಿ",
    "Kobbari mithai (coconut burfi)",
    kiloPacks(60_000),
  ),
  chakkuli: item("ಚಕ್ಕುಲಿ", "Chakkuli (chakli)", kiloPacks(40_000)),
  kodubale: item("ಕೋಡುಬಳೆ", "Kodubale", kiloPacks(40_000)),
  nippattu: item("ನಿಪ್ಪಟ್ಟು", "Nippattu", kiloPacks(40_000)),
  diwaliBox: item(
    "ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್",
    "Diwali assorted box",
    kiloPacks(88_000, [500, 1000]),
  ),
};

export const menu: ReadingItem[] = Object.values(heroMenu);

export const gujiya = item("गुजिया", "Gujiya", [
  { id: id(), label: "1 piece", grams: null, pieces: 1, price: 3_000 },
  { id: id(), label: "6 pieces", grams: null, pieces: 6, price: 18_000 },
  { id: id(), label: "12 pieces", grams: null, pieces: 12, price: 36_000 },
]);
