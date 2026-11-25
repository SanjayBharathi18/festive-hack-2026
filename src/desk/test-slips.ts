import type { Day } from "../../shared/day.ts";
import type { DeskSlip } from "../../shared/orders.ts";

let made = 0;

export function fakeSlip({
  number = 1,
  day = "2026-11-28" as Day,
  grams = 1000,
  ...rest
}: Partial<DeskSlip> & { grams?: number } = {}): DeskSlip {
  made += 1;
  const id = `00000000-0000-4000-8000-${String(made).padStart(12, "0")}`;
  return {
    id,
    number,
    token: `token-${made}`,
    order_url: `https://app.example/o/token-${made}`,
    share_url: null,
    status: "new",
    next_stamp: "making",
    paid: false,
    refunded: false,
    refund: null,
    payment_required: false,
    source: "link",
    fulfilment: "delivery",
    day,
    total: 88_000,
    lines: [
      {
        item_id: "086ced7f-5846-8368-9591-69c03683048d",
        pack_id: "5f51e217-1da8-8358-9d21-196f83ea559f",
        name: "ಮೈಸೂರು ಪಾಕ್",
        label: `${grams} g`,
        quantity: 1,
        price: 88_000,
        grams,
        pieces: null,
        veg_mark: "veg",
        name_latin: "Mysore pak",
      },
    ],
    buyer_name: "Lakshmi Rao",
    buyer_phone: null,
    buyer_language: "kn",
    address: "Banashankari",
    gift: null,
    note: null,
    note_translation: null,
    cancel_reason: null,
    reading: null,
    messages: [],
    created_at: 1_795_450_950_267,
    ...rest,
  };
}
