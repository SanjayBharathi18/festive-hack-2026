import { z } from "zod";
import type { Point } from "./geo.ts";
import { appLanguageSchema, type AppLanguage } from "./languages.ts";

export type CityLabels = Readonly<Record<AppLanguage, string>>;

type City = {
  key: string;
  labels: CityLabels;
  centre: Point;
  names: readonly string[];
};

export const defaultCity = "bengaluru";
export const maxCityLength = 60;

// The cities of the app: a label in each app language, the centre that
// Nearest measures from without the buyer's location, and their other names
// (older Latin names and other spellings). A board post and a store match
// when their cities give the same key, so "पुणे" on a post reaches a store in
// "Pune". Another city matches only when its words are the same, in any case.
const cities: readonly City[] = [
  {
    key: "bengaluru",
    labels: {
      en: "Bengaluru",
      hi: "बेंगलुरु",
      kn: "ಬೆಂಗಳೂರು",
      ta: "பெங்களூரு",
      te: "బెంగళూరు",
      mr: "बेंगळुरू",
    },
    centre: { lat: 12.9716, lng: 77.5946 },
    names: [
      "Bangalore",
      "Bengalooru",
      "बेंगलूरु",
      "बंगलौर",
      "बैंगलोर",
      "बेंगलोर",
      "பெங்களூர்",
      "బెంగుళూరు",
    ],
  },
  {
    key: "mysuru",
    labels: {
      en: "Mysuru",
      hi: "मैसूर",
      kn: "ಮೈಸೂರು",
      ta: "மைசூரு",
      te: "మైసూరు",
      mr: "म्हैसूर",
    },
    centre: { lat: 12.2958, lng: 76.6394 },
    names: ["Mysore", "मैसूरु", "மைசூர்"],
  },
  {
    key: "mangaluru",
    labels: {
      en: "Mangaluru",
      hi: "मंगलुरु",
      kn: "ಮಂಗಳೂರು",
      ta: "மங்களூரு",
      te: "మంగళూరు",
      mr: "मंगळूर",
    },
    centre: { lat: 12.9141, lng: 74.856 },
    names: ["Mangalore", "मंगलौर", "மங்களூர்"],
  },
  {
    key: "hubballi",
    labels: {
      en: "Hubballi",
      hi: "हुबली",
      kn: "ಹುಬ್ಬಳ್ಳಿ",
      ta: "ஹுப்பள்ளி",
      te: "హుబ్బళ్ళి",
      mr: "हुबळी",
    },
    centre: { lat: 15.3647, lng: 75.124 },
    names: ["Hubli", "ஹுப்ளி"],
  },
  {
    key: "mumbai",
    labels: {
      en: "Mumbai",
      hi: "मुंबई",
      kn: "ಮುಂಬೈ",
      ta: "மும்பை",
      te: "ముంబై",
      mr: "मुंबई",
    },
    centre: { lat: 19.076, lng: 72.8777 },
    names: ["Bombay", "मुम्बई"],
  },
  {
    key: "pune",
    labels: {
      en: "Pune",
      hi: "पुणे",
      kn: "ಪುಣೆ",
      ta: "புனே",
      te: "పుణే",
      mr: "पुणे",
    },
    centre: { lat: 18.5204, lng: 73.8567 },
    names: ["Poona", "పూణే"],
  },
  {
    key: "nagpur",
    labels: {
      en: "Nagpur",
      hi: "नागपुर",
      kn: "ನಾಗಪುರ",
      ta: "நாக்பூர்",
      te: "నాగపూర్",
      mr: "नागपूर",
    },
    centre: { lat: 21.1458, lng: 79.0882 },
    names: [],
  },
  {
    key: "nashik",
    labels: {
      en: "Nashik",
      hi: "नासिक",
      kn: "ನಾಸಿಕ್",
      ta: "நாசிக்",
      te: "నాసిక్",
      mr: "नाशिक",
    },
    centre: { lat: 19.9975, lng: 73.7898 },
    names: ["Nasik"],
  },
  {
    key: "delhi",
    labels: {
      en: "Delhi",
      hi: "दिल्ली",
      kn: "ದೆಹಲಿ",
      ta: "டெல்லி",
      te: "ఢిల్లీ",
      mr: "दिल्ली",
    },
    centre: { lat: 28.6139, lng: 77.209 },
    names: [
      "New Delhi",
      "नई दिल्ली",
      "नवी दिल्ली",
      "ನವದೆಹಲಿ",
      "தில்லி",
      "புது தில்லி",
      "న్యూఢిల్లీ",
    ],
  },
  {
    key: "chennai",
    labels: {
      en: "Chennai",
      hi: "चेन्नई",
      kn: "ಚೆನ್ನೈ",
      ta: "சென்னை",
      te: "చెన్నై",
      mr: "चेन्नई",
    },
    centre: { lat: 13.0827, lng: 80.2707 },
    names: ["Madras"],
  },
  {
    key: "coimbatore",
    labels: {
      en: "Coimbatore",
      hi: "कोयंबटूर",
      kn: "ಕೊಯಮತ್ತೂರು",
      ta: "கோயம்புத்தூர்",
      te: "కోయంబత్తూరు",
      mr: "कोइंबतूर",
    },
    centre: { lat: 11.0168, lng: 76.9558 },
    names: ["Kovai", "கோவை"],
  },
  {
    key: "madurai",
    labels: {
      en: "Madurai",
      hi: "मदुरै",
      kn: "ಮಧುರೈ",
      ta: "மதுரை",
      te: "మదురై",
      mr: "मदुराई",
    },
    centre: { lat: 9.9252, lng: 78.1198 },
    names: [],
  },
  {
    key: "hyderabad",
    labels: {
      en: "Hyderabad",
      hi: "हैदराबाद",
      kn: "ಹೈದರಾಬಾದ್",
      ta: "ஹைதராபாத்",
      te: "హైదరాబాద్",
      mr: "हैदराबाद",
    },
    centre: { lat: 17.385, lng: 78.4867 },
    names: [],
  },
  {
    key: "visakhapatnam",
    labels: {
      en: "Visakhapatnam",
      hi: "विशाखापत्तनम",
      kn: "ವಿಶಾಖಪಟ್ಟಣಂ",
      ta: "விசாகப்பட்டினம்",
      te: "విశాఖపట్నం",
      mr: "विशाखापट्टणम",
    },
    centre: { lat: 17.6868, lng: 83.2185 },
    names: ["Vizag"],
  },
  {
    key: "vijayawada",
    labels: {
      en: "Vijayawada",
      hi: "विजयवाड़ा",
      kn: "ವಿಜಯವಾಡ",
      ta: "விஜயவாடா",
      te: "విజయవాడ",
      mr: "विजयवाडा",
    },
    centre: { lat: 16.5062, lng: 80.648 },
    names: [],
  },
  {
    key: "kolkata",
    labels: {
      en: "Kolkata",
      hi: "कोलकाता",
      kn: "ಕೋಲ್ಕತ್ತಾ",
      ta: "கொல்கத்தா",
      te: "కోల్కతా",
      mr: "कोलकाता",
    },
    centre: { lat: 22.5726, lng: 88.3639 },
    names: ["Calcutta"],
  },
  {
    key: "ahmedabad",
    labels: {
      en: "Ahmedabad",
      hi: "अहमदाबाद",
      kn: "ಅಹಮದಾಬಾದ್",
      ta: "அகமதாபாத்",
      te: "అహ్మదాబాద్",
      mr: "अहमदाबाद",
    },
    centre: { lat: 23.0225, lng: 72.5714 },
    names: [],
  },
];

const cityNameSchema = z.string().min(1).max(maxCityLength);

// A city of the marketplace. centre is null for a city that is not in the
// table of the app: Nearest has no centre to measure from there.
export const cityChoiceSchema = z.object({
  key: cityNameSchema,
  labels: z.record(appLanguageSchema, cityNameSchema),
  centre: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable(),
});
export type CityChoice = z.infer<typeof cityChoiceSchema>;

export const citiesAnswerSchema = z.object({
  cities: z.array(cityChoiceSchema),
});
export type CitiesAnswer = z.infer<typeof citiesAnswerSchema>;

export const cityParamSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().trim().min(1).max(maxCityLength).optional(),
);

export const cityQuerySchema = z.object({ city: cityParamSchema });

const byKey = new Map(cities.map((city) => [city.key, city]));
const keys = new Map(
  cities.flatMap((city) =>
    [...Object.values(city.labels), ...city.names].map(
      (name) => [cityWords(name), city.key] as const,
    ),
  ),
);

export function sameCity(a: string, b: string): boolean {
  return cityKey(a) === cityKey(b);
}

export function cityKey(city: string): string {
  const words = cityWords(city);
  return keys.get(words) ?? words;
}

// The centre of a city of the table, by any of its names.
export function cityCentre(city: string): Point | null {
  return byKey.get(cityKey(city))?.centre ?? null;
}

// The cities of the marketplace from the cities of its stores, once each, in
// the order of their English labels. A city that is not in the table keeps
// the name of its first store in each language.
export function cityChoices(names: readonly string[]): CityChoice[] {
  const choices = new Map<string, CityChoice>();
  for (const name of names) {
    const key = cityKey(name);
    if (key === "" || choices.has(key)) continue;
    const city = byKey.get(key);
    const own = name.trim().replace(/\s+/g, " ");
    choices.set(
      key,
      city === undefined
        ? { key, labels: sameLabels(own), centre: null }
        : { key, labels: { ...city.labels }, centre: { ...city.centre } },
    );
  }
  return [...choices.values()].sort((a, b) =>
    a.labels.en.localeCompare(b.labels.en, "en-IN"),
  );
}

function sameLabels(name: string): CityLabels {
  return Object.fromEntries(
    appLanguageSchema.options.map((language) => [language, name]),
  ) as Record<AppLanguage, string>;
}

function cityWords(city: string): string {
  return city
    .normalize("NFC")
    .replace(/[\u200c\u200d]/g, "")
    .toLocaleLowerCase("en-IN")
    .replace(/[\s.,'’-]+/g, " ")
    .trim();
}
