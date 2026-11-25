import type { SetupItem } from "../../shared/setup.ts";
import { newDraft, type Draft } from "./draft.ts";

export const storeId = "6f0c2a4e-8f7b-4b8e-9a51-2d3c4b5a6f70";

export function chakkuli(overrides: Partial<SetupItem> = {}): SetupItem {
  return {
    id: "0b6a9c1e-2d3f-4a5b-8c7d-9e0f1a2b3c4d",
    name: "ಚಕ್ಕುಲಿ",
    name_latin: "Chakkuli",
    category: "savouries",
    veg_mark: "veg",
    box_contents: null,
    packs: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        label: "1 kg",
        grams: 1000,
        pieces: null,
        price: 40_000,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        label: "250 g",
        grams: 250,
        pieces: null,
        price: 10_000,
      },
    ],
    ...overrides,
  };
}

// A draft with each step before the preview done.
export function readyDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    ...newDraft(storeId),
    language: "kn",
    items: [chakkuli()],
    name: "Shobha's Kitchen",
    slug: "shobhas-kitchen",
    offers_pickup: true,
    area: "Basavanagudi",
    city: "Bengaluru",
    step: "preview",
    furthest: "preview",
    ...overrides,
  };
}
