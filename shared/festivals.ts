import { addDays, type Day } from "./day.ts";

export type Festival = {
  id: string;
  name: string;
  date: Day;
  items: readonly string[];
};

// A festival is near while its date is in the 21 days of the day picker:
// from today to 20 days ahead (docs/system.md, "Festivals" and "Capacity").
export const festivalWindowDays = 21;

// The festivals of the season, in date order. The items are the Latin names
// of what cooks commonly make for each one. Eid ul-Fitr follows the moon, so
// its date is the expected one.
export const festivals: readonly Festival[] = [
  {
    id: "diwali",
    name: "Diwali",
    date: "2026-11-08",
    items: [
      "Kaju katli",
      "Mysore pak",
      "Besan laddu",
      "Chakli",
      "Kodubale",
      "Karanji",
    ],
  },
  {
    id: "bhai_dooj",
    name: "Bhai Dooj",
    date: "2026-11-11",
    items: ["Kaju katli", "Motichoor laddu", "Gulab jamun", "Gift box"],
  },
  {
    id: "chhath",
    name: "Chhath Puja",
    date: "2026-11-15",
    items: ["Thekua", "Kasar laddu", "Kheer"],
  },
  {
    id: "guru_nanak_jayanti",
    name: "Guru Nanak Jayanti",
    date: "2026-11-24",
    items: ["Kada prasad", "Pinni", "Besan laddu", "Mathri"],
  },
  {
    id: "christmas",
    name: "Christmas",
    date: "2026-12-25",
    items: ["Plum cake", "Rose cookies", "Kulkuls", "Nankhatai"],
  },
  {
    id: "makar_sankranti",
    name: "Makar Sankranti",
    date: "2027-01-14",
    items: ["Ellu bella", "Til laddu", "Chikki", "Sakkare acchu"],
  },
  {
    id: "pongal",
    name: "Pongal",
    date: "2027-01-15",
    items: ["Sakkarai pongal", "Ven pongal", "Murukku", "Adhirasam"],
  },
  {
    id: "vasant_panchami",
    name: "Vasant Panchami",
    date: "2027-02-11",
    items: ["Kesari bath", "Boondi laddu", "Malpua"],
  },
  {
    id: "maha_shivaratri",
    name: "Maha Shivaratri",
    date: "2027-03-06",
    items: ["Thandai", "Sabudana vada", "Makhana kheer"],
  },
  {
    id: "eid_ul_fitr",
    name: "Eid ul-Fitr",
    date: "2027-03-10",
    items: ["Sheer khurma", "Seviyan", "Phirni", "Biryani"],
  },
  {
    id: "holi",
    name: "Holi",
    date: "2027-03-22",
    items: ["Gujiya", "Thandai", "Malpua", "Namak para", "Mathri"],
  },
  {
    id: "ugadi",
    name: "Ugadi and Gudi Padwa",
    date: "2027-04-07",
    items: ["Obbattu", "Puran poli", "Bevu bella", "Shrikhand"],
  },
];

export function nearFestivals(
  today: Day,
  list: readonly Festival[] = festivals,
): Festival[] {
  const last = addDays(today, festivalWindowDays - 1);
  return list
    .filter((festival) => festival.date >= today && festival.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function nearFestival(
  today: Day,
  list: readonly Festival[] = festivals,
): Festival | null {
  return nearFestivals(today, list)[0] ?? null;
}
