import type { Day } from "../../shared/day.ts";
import type { AppLanguage } from "../../shared/languages.ts";
import type { Fulfilment } from "../../shared/model.ts";
import type { CancelReason } from "../../shared/orders.ts";

export const templateNames = [
  "order_placed",
  "order_ready",
  "order_changed",
  "order_cancelled",
] as const;
export type TemplateName = (typeof templateNames)[number];

export type MessageLine = { quantity: number; name: string; label: string };

export type MessageValues = {
  store: string;
  number: number;
  lines: readonly MessageLine[];
  total: number;
  day: Day;
  fulfilment: Fulfilment;
  pickupAddress: string | null;
  orderUrl: string;
  storeChatUrl: string;
  reason: CancelReason | null;
};

type Phrases = {
  placed: (store: string, number: number) => string;
  readyForPickup: (store: string, number: number) => string;
  readyForDelivery: (store: string, number: number) => string;
  changed: (store: string, number: number) => string;
  cancelled: (store: string, number: number) => string;
  deskShare: (store: string, number: number) => string;
  storeChat: (number: number) => string;
  reasons: Record<CancelReason, string>;
  reason: string;
  total: string;
  pickup: string;
  delivery: string;
  pickupAddress: string;
  seeOrder: string;
  messageStore: string;
  stop: string;
};

// The hi, kn, ta, te and mr texts are drafts for review by native speakers.
export const phrases: Record<AppLanguage, Phrases> = {
  en: {
    placed: (store, number) => `Your order ${number} at ${store} is placed.`,
    readyForPickup: (store, number) =>
      `Your order ${number} at ${store} is ready for pickup.`,
    readyForDelivery: (store, number) =>
      `Your order ${number} at ${store} is ready. It goes out for delivery soon.`,
    changed: (store, number) => `Your order ${number} at ${store} has changed.`,
    cancelled: (store, number) =>
      `Your order ${number} at ${store} is cancelled.`,
    deskShare: (store, number) => `Your order ${number} at ${store}`,
    storeChat: (number) => `Hello, this is about my order ${number}.`,
    reasons: {
      cant_deliver: "The store can't deliver to your address.",
      item_ran_out: "An item ran out.",
      day_full: "The day is full.",
      other: "Please message the store.",
    },
    reason: "Reason",
    total: "Total",
    pickup: "Pickup",
    delivery: "Delivery",
    pickupAddress: "Pickup address",
    seeOrder: "See your order",
    messageStore: "Message the store",
    stop: "To stop these messages, reply STOP.",
  },
  hi: {
    placed: (store, number) => `${store} पर आपका ऑर्डर ${number} प्लेस हो गया है।`,
    readyForPickup: (store, number) =>
      `${store} पर आपका ऑर्डर ${number} पिकअप के लिए तैयार है।`,
    readyForDelivery: (store, number) =>
      `${store} पर आपका ऑर्डर ${number} तैयार है। जल्द ही डिलीवरी के लिए निकलेगा।`,
    changed: (store, number) => `${store} पर आपके ऑर्डर ${number} में बदलाव हुआ है।`,
    cancelled: (store, number) =>
      `${store} पर आपका ऑर्डर ${number} कैंसल हो गया है।`,
    deskShare: (store, number) => `${store} पर आपका ऑर्डर ${number}`,
    storeChat: (number) => `नमस्ते, यह मेरे ऑर्डर ${number} के बारे में है।`,
    reasons: {
      cant_deliver: "स्टोर आपके पते पर डिलीवरी नहीं कर सकता।",
      item_ran_out: "एक आइटम खत्म हो गया।",
      day_full: "उस दिन के ऑर्डर पूरे हो गए हैं।",
      other: "कृपया स्टोर को मैसेज करें।",
    },
    reason: "कारण",
    total: "कुल",
    pickup: "पिकअप",
    delivery: "डिलीवरी",
    pickupAddress: "पिकअप का पता",
    seeOrder: "अपना ऑर्डर देखें",
    messageStore: "स्टोर को मैसेज करें",
    stop: "ये मैसेज बंद करने के लिए STOP लिखकर जवाब दें।",
  },
  kn: {
    placed: (store, number) => `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number} ಪ್ಲೇಸ್ ಆಗಿದೆ.`,
    readyForPickup: (store, number) =>
      `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number} ಪಿಕಪ್‌ಗೆ ಸಿದ್ಧವಾಗಿದೆ.`,
    readyForDelivery: (store, number) =>
      `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number} ಸಿದ್ಧವಾಗಿದೆ. ಬೇಗ ಡೆಲಿವರಿಗೆ ಹೊರಡುತ್ತದೆ.`,
    changed: (store, number) => `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number} ಬದಲಾಗಿದೆ.`,
    cancelled: (store, number) => `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number} ರದ್ದಾಗಿದೆ.`,
    deskShare: (store, number) => `${store} ನಲ್ಲಿ ನಿಮ್ಮ ಆರ್ಡರ್ ${number}`,
    storeChat: (number) => `ನಮಸ್ಕಾರ, ಇದು ನನ್ನ ಆರ್ಡರ್ ${number} ಬಗ್ಗೆ.`,
    reasons: {
      cant_deliver: "ನಿಮ್ಮ ವಿಳಾಸಕ್ಕೆ ಸ್ಟೋರ್ ಡೆಲಿವರಿ ಮಾಡಲು ಆಗುವುದಿಲ್ಲ.",
      item_ran_out: "ಒಂದು ಐಟಂ ಮುಗಿದುಹೋಗಿದೆ.",
      day_full: "ಆ ದಿನದ ಆರ್ಡರ್‌ಗಳು ತುಂಬಿವೆ.",
      other: "ದಯವಿಟ್ಟು ಸ್ಟೋರ್‌ಗೆ ಮೆಸೇಜ್ ಮಾಡಿ.",
    },
    reason: "ಕಾರಣ",
    total: "ಒಟ್ಟು",
    pickup: "ಪಿಕಪ್",
    delivery: "ಡೆಲಿವರಿ",
    pickupAddress: "ಪಿಕಪ್ ವಿಳಾಸ",
    seeOrder: "ನಿಮ್ಮ ಆರ್ಡರ್ ನೋಡಿ",
    messageStore: "ಸ್ಟೋರ್‌ಗೆ ಮೆಸೇಜ್ ಮಾಡಿ",
    stop: "ಈ ಮೆಸೇಜ್‌ಗಳನ್ನು ನಿಲ್ಲಿಸಲು STOP ಎಂದು ಉತ್ತರಿಸಿ.",
  },
  ta: {
    placed: (store, number) => `${store}-இல் உங்கள் ஆர்டர் ${number} பதிவாகிவிட்டது.`,
    readyForPickup: (store, number) =>
      `${store}-இல் உங்கள் ஆர்டர் ${number} பிக்கப்புக்குத் தயாராக உள்ளது.`,
    readyForDelivery: (store, number) =>
      `${store}-இல் உங்கள் ஆர்டர் ${number} தயாராக உள்ளது. விரைவில் டெலிவரிக்குப் புறப்படும்.`,
    changed: (store, number) =>
      `${store}-இல் உங்கள் ஆர்டர் ${number} மாற்றப்பட்டுள்ளது.`,
    cancelled: (store, number) =>
      `${store}-இல் உங்கள் ஆர்டர் ${number} ரத்து செய்யப்பட்டது.`,
    deskShare: (store, number) => `${store}-இல் உங்கள் ஆர்டர் ${number}`,
    storeChat: (number) => `வணக்கம், இது என் ஆர்டர் ${number} பற்றியது.`,
    reasons: {
      cant_deliver: "உங்கள் முகவரிக்கு ஸ்டோரால் டெலிவரி செய்ய முடியாது.",
      item_ran_out: "ஒரு பொருள் தீர்ந்துவிட்டது.",
      day_full: "அந்த நாளுக்கான ஆர்டர்கள் நிரம்பிவிட்டன.",
      other: "தயவுசெய்து ஸ்டோருக்கு மெசேஜ் அனுப்புங்கள்.",
    },
    reason: "காரணம்",
    total: "மொத்தம்",
    pickup: "பிக்கப்",
    delivery: "டெலிவரி",
    pickupAddress: "பிக்கப் முகவரி",
    seeOrder: "உங்கள் ஆர்டரைப் பாருங்கள்",
    messageStore: "ஸ்டோருக்கு மெசேஜ் அனுப்புங்கள்",
    stop: "இந்த மெசேஜ்களை நிறுத்த STOP என்று பதில் அனுப்புங்கள்.",
  },
  te: {
    placed: (store, number) => `${store}లో మీ ఆర్డర్ ${number} నమోదైంది.`,
    readyForPickup: (store, number) =>
      `${store}లో మీ ఆర్డర్ ${number} పికప్‌కు సిద్ధంగా ఉంది.`,
    readyForDelivery: (store, number) =>
      `${store}లో మీ ఆర్డర్ ${number} సిద్ధంగా ఉంది. త్వరలో డెలివరీకి బయలుదేరుతుంది.`,
    changed: (store, number) => `${store}లో మీ ఆర్డర్ ${number} మారింది.`,
    cancelled: (store, number) => `${store}లో మీ ఆర్డర్ ${number} రద్దు చేయబడింది.`,
    deskShare: (store, number) => `${store}లో మీ ఆర్డర్ ${number}`,
    storeChat: (number) => `నమస్తే, ఇది నా ఆర్డర్ ${number} గురించి.`,
    reasons: {
      cant_deliver: "మీ చిరునామాకు స్టోర్ డెలివరీ చేయలేదు.",
      item_ran_out: "ఒక ఐటమ్ అయిపోయింది.",
      day_full: "ఆ రోజు ఆర్డర్లు నిండిపోయాయి.",
      other: "దయచేసి స్టోర్‌కు మెసేజ్ చేయండి.",
    },
    reason: "కారణం",
    total: "మొత్తం",
    pickup: "పికప్",
    delivery: "డెలివరీ",
    pickupAddress: "పికప్ చిరునామా",
    seeOrder: "మీ ఆర్డర్ చూడండి",
    messageStore: "స్టోర్‌కు మెసేజ్ చేయండి",
    stop: "ఈ మెసేజ్‌లు ఆపడానికి STOP అని రిప్లై చేయండి.",
  },
  mr: {
    placed: (store, number) =>
      `${store} मध्ये तुमची ऑर्डर ${number} नोंदवली गेली आहे.`,
    readyForPickup: (store, number) =>
      `${store} मधील तुमची ऑर्डर ${number} पिकअपसाठी तयार आहे.`,
    readyForDelivery: (store, number) =>
      `${store} मधील तुमची ऑर्डर ${number} तयार आहे. लवकरच डिलिव्हरीसाठी निघेल.`,
    changed: (store, number) =>
      `${store} मधील तुमच्या ऑर्डर ${number} मध्ये बदल झाला आहे.`,
    cancelled: (store, number) =>
      `${store} मधील तुमची ऑर्डर ${number} रद्द झाली आहे.`,
    deskShare: (store, number) => `${store} मधील तुमची ऑर्डर ${number}`,
    storeChat: (number) => `नमस्कार, हे माझ्या ऑर्डर ${number} बद्दल आहे.`,
    reasons: {
      cant_deliver: "स्टोअर तुमच्या पत्त्यावर डिलिव्हरी करू शकत नाही.",
      item_ran_out: "एक पदार्थ संपला.",
      day_full: "त्या दिवसाच्या ऑर्डर पूर्ण भरल्या आहेत.",
      other: "कृपया स्टोअरला मेसेज करा.",
    },
    reason: "कारण",
    total: "एकूण",
    pickup: "पिकअप",
    delivery: "डिलिव्हरी",
    pickupAddress: "पिकअपचा पत्ता",
    seeOrder: "तुमची ऑर्डर पाहा",
    messageStore: "स्टोअरला मेसेज करा",
    stop: "हे मेसेज बंद करण्यासाठी STOP असे उत्तर पाठवा.",
  },
};

export function renderMessage(
  template: TemplateName,
  language: AppLanguage,
  values: MessageValues,
): string {
  const words = phrases[language];
  const { store, number } = values;
  const pickup =
    values.fulfilment === "pickup" && values.pickupAddress !== null
      ? [`${words.pickupAddress}: ${values.pickupAddress}`]
      : [];
  const summary = [
    ...values.lines.map(lineText),
    `${words.total}: ${rupees(values.total)}`,
    `${values.fulfilment === "pickup" ? words.pickup : words.delivery}: ${dayText(values.day, language)}`,
  ];
  const body = {
    order_placed: () => [words.placed(store, number), ...summary, ...pickup],
    order_ready: () =>
      values.fulfilment === "pickup"
        ? [words.readyForPickup(store, number), ...pickup]
        : [words.readyForDelivery(store, number)],
    order_changed: () => [words.changed(store, number), ...summary, ...pickup],
    order_cancelled: () => [
      words.cancelled(store, number),
      `${words.reason}: ${words.reasons[values.reason ?? "other"]}`,
    ],
  }[template]();
  return [
    ...body,
    `${words.seeOrder}: ${values.orderUrl}`,
    `${words.messageStore}: ${values.storeChatUrl}`,
    words.stop,
  ].join("\n");
}

export function deskShareText(
  language: AppLanguage,
  values: Omit<MessageValues, "pickupAddress" | "storeChatUrl" | "reason">,
): string {
  const words = phrases[language];
  return [
    words.deskShare(values.store, values.number),
    ...values.lines.map(lineText),
    `${words.total}: ${rupees(values.total)}`,
    `${values.fulfilment === "pickup" ? words.pickup : words.delivery}: ${dayText(values.day, language)}`,
    `${words.seeOrder}: ${values.orderUrl}`,
  ].join("\n");
}

export function rupees(paise: number): string {
  const amount = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
  return `₹${amount}`;
}

export function dayText(day: Day, language: AppLanguage): string {
  return new Intl.DateTimeFormat(`${language}-IN-u-nu-latn`, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

function lineText({ quantity, name, label }: MessageLine): string {
  return `${quantity} × ${name}${label === "" ? "" : ` ${label}`}`;
}
