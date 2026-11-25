---
title: Demo data
purpose: The demo content: stores, menus, packages, one board post, and the voice and setup lines.
read-when: You change the seed file, record fixtures, run the experiment or the load script, or need real content for a design round.
owns: demo stores, test store, menus, prices, pack rule, coordinates, demo ratings, caterer packages, demo board post, voice lines, setup lines, test audio
---

# Demo data

The seed file `fixtures/demo.json` holds this content. The seed refresh is in `docs/system.md` ("Demo mode").

- All people and stores are made up.
- Prices are placeholders for home food in the city of each store.
- Days are relative: "Saturday" is the next Saturday after the seed day.
- Coordinates are approximate centres of each area.
- Each demo store has the FSSAI number 00000000000000, so its store page shows "FSSAI 00000000000000 (given by seller)". The Bulk and Catering tabs list only stores in the marketplace with an FSSAI number. The test store has no number, so its store page shows no FSSAI line.
- Star ratings are made-up demo data, like all demo data (seed field `rating`, columns `stores.rating_average` and `stores.rating_count`): averages from 3.9 to 4.8 and counts from 23 to 398, with Shobha's Kitchen highest (4.8 from 312 buyers). Test Kitchen and Daawat Caterers have none (caterers have no ratings), so they show "New". The nightly refresh restores them. Real ratings come from reviews (README.md, "Roadmap").
- Packs: an item with a price per kg has packs of 250 g, 500 g and 1 kg at that rate, each rounded up to the next ₹5 (₹650/kg gives 250 g at ₹165). An item with a price per piece has packs of 1, 6 and 12 pieces. An item with its own packs lists them. A dish sold by the plate has one pack, "1 plate".

## Hero store: Shobha's Kitchen

- Slug `shobhas-kitchen`. Area Basavanagudi, Bengaluru (12.9417, 77.5755). Seller language: Kannada.
- Pickup and delivery. Online payment on (simulated). **Ask strangers to pay online** off.
- In the marketplace. Working days: every day.
- Daily limit: 25 kg. No last day for orders.
- Seed orders: 3 finished, paid orders 3, 9 and 16 days before the seed day, so that the 30-day totals are not empty. On the coming Saturday, 12 orders with 23 kg in total, so that Saturday is almost full. On the Sunday after it, 5 orders with 9 kg.
- Bulk section on, for the demo desk: "Diwali gift boxes for offices and families". The Diwali assorted box is a bulk item from 25 boxes, counted as pieces, at ₹420 a box.
- Seed quote requests, so that the demo desk shows its Quote requests tab: Rohan Mehta, 60 boxes for a Koramangala office, 6 days after the seed day, with a note in Hindi ("हर डिब्बे पर हमारी कंपनी का नाम चाहिए।"), which shows translated on her Kannada desk; and Lakshmi Rao, 30 boxes for Jayanagar, 9 days after the seed day, with a note in Kannada ("ಪ್ರತಿ ಡಬ್ಬದ ಜೊತೆ ಶುಭಾಶಯ ಪತ್ರ ಬೇಕು.").

| Item | Kannada name | Category | Mark | Packs and prices | Allergens |
|---|---|---|---|---|---|
| Mysore pak | ಮೈಸೂರು ಪಾಕ್ | Sweets | Veg | 250 g ₹230 · 500 g ₹450 · 1 kg ₹880 | Dairy |
| Kaju katli | ಕಾಜು ಕಟ್ಲಿ | Sweets | Veg | 250 g ₹330 · 500 g ₹650 · 1 kg ₹1,280 | Nuts |
| Besan laddu | ಬೇಸನ್ ಲಡ್ಡು | Sweets | Veg | 250 g ₹170 · 500 g ₹330 · 1 kg ₹650 | Dairy |
| Kobbari mithai (coconut burfi) | ಕೊಬ್ಬರಿ ಮಿಠಾಯಿ | Sweets | Veg | 250 g ₹160 · 500 g ₹310 · 1 kg ₹600 | Dairy |
| Chakkuli (chakli) | ಚಕ್ಕುಲಿ | Savouries | Veg | 250 g ₹110 · 500 g ₹210 · 1 kg ₹400 | Sesame |
| Kodubale | ಕೋಡುಬಳೆ | Savouries | Veg | 250 g ₹110 · 500 g ₹210 · 1 kg ₹400 | Wheat |
| Nippattu | ನಿಪ್ಪಟ್ಟು | Savouries | Veg | 250 g ₹110 · 500 g ₹210 · 1 kg ₹400 | Peanuts |
| Diwali assorted box (**Special**) | ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್ | Sweets | Veg | 500 g ₹450 · 1 kg ₹880 | Nuts, dairy |

Box contents: Mysore pak, kaju katli, besan laddu, kobbari mithai.

## Test store: Test Kitchen

- Slug `test-kitchen`. The same menu as Shobha's Kitchen.
- Not in the marketplace and not a demo store. No daily limit.
- The experiment run (`docs/system.md`, "Experiment run") and the load script of the incident (`scripts/load.ts`) use this store, so that the hero store keeps its seed days.

## Other demo stores

Each store works every day. A dish marked **Special** has the **Special** tag (`docs/concept.md`).

| Store | Area (lat, lng) | Language | Items and prices | Limit and notes |
|---|---|---|---|---|
| Ghar Ki Mithai | HSR Layout (12.9116, 77.6474) | Hindi | Kaju katli ₹1,300/kg, motichoor laddu (**Special**) ₹600/kg, gujiya ₹30/piece, namak para ₹400/kg, mathri ₹450/kg | No limit. Bulk section on: "Bulk and corporate orders taken". Bulk: kaju katli from 500 pieces at ₹15 a piece; assorted gift box (250 g) from 100 boxes, counted as pieces, "Price on request", bulk only |
| Amma's Murukku Corner | Ulsoor (12.9817, 77.6286) | Tamil | Murukku ₹420/kg, thattai ₹420/kg, ribbon pakoda ₹400/kg, adhirasam ₹25/piece, Mysore pak ₹850/kg | No limit. Pickup only |
| Andhra Ruchulu | Marathahalli (12.9569, 77.7011) | Telugu | Kajjikayalu ₹25/piece, chekkalu ₹400/kg, sunnundalu ₹700/kg, gavvalu ₹450/kg, boondi laddu ₹550/kg | 15 orders a day |
| Faral Ghar | Whitefield (12.9698, 77.7500) | Marathi | Chakli ₹420/kg, shankarpali ₹400/kg, karanji ₹25/piece (40 g), besan laddu ₹650/kg, poha chivda ₹380/kg, anarse (**Special**) ₹30/piece (30 g) | 20 kg a day |
| Coastal Kitchen | Bannerghatta Road (12.8889, 77.5970) | English | Kulkuls ₹500/kg, rose cookies (egg) ₹550/kg, nankhatai ₹500/kg, plum cake (egg, **Special**): 500 g ₹450 · 1 kg ₹880 | No limit. Christmas menu |
| Daawat Caterers | Jayanagar (12.9250, 77.5938) | Kannada | Catering only (normal orders off) | See "Demo caterer: Daawat Caterers" |

## Demo stores in other cities

These stores give the homepage snacks, meals, egg and non-veg dishes, and cooks outside Bengaluru.

- The city is its plain English name, for the city filter.
- Dish names are in the seller's script, with a Latin name. The table gives the Latin names. The Kolkata store has Latin names only, because Bengali is not an app language and our fonts carry no Bengali script.
- The items are grouped by category. The mark is Veg unless the item says egg or non-veg (`docs/design.md`, "Icons" 4). The allergens follow each price in brackets.
- The stores have no seed orders.

| Store | Area (lat, lng) | Language | Items and prices | Limit and notes |
|---|---|---|---|---|
| Aai's Dabba | Dadar, Mumbai (19.0178, 72.8478) | Marathi | Snacks: vada pav ₹25/piece [wheat]. Meals: pav bhaji ₹140/plate [wheat, dairy]; anda bhurji pav (egg) ₹90/plate [egg, wheat, dairy]; kolambi bhaat, prawn rice (non-veg) ₹260/plate [shellfish]. Sweets: ukadiche modak (**Special**) ₹50/piece [dairy] | No limit. Pickup only. Every day |
| Biji's Rasoi | Lajpat Nagar, Delhi (28.5677, 77.2433) | Hindi | Meals: chole bhature ₹130/plate [wheat, dairy]; butter chicken (non-veg) ₹750/kg [dairy, nuts]. Snacks: samosa ₹20/piece [wheat]; chicken seekh kebab (non-veg) ₹60/piece. Sweets: gajar ka halwa (**Special**) ₹520/kg [dairy, nuts] | No limit. Every day |
| Paati Samayal | Mylapore, Chennai (13.0368, 80.2676) | Tamil | Meals: egg kothu parotta (egg) ₹130/plate [wheat, egg]; veg meals ₹150/plate [dairy]. Snacks: chicken 65 (non-veg) ₹660/kg [egg]; medu vada ₹15/piece. Sweets: sakkarai pongal ₹380/kg [dairy, nuts] | No limit. Closed on Tuesdays |
| Ammamma's Biryani | Kukatpally, Hyderabad (17.4849, 78.4138) | Telugu | Meals: Hyderabadi chicken dum biryani (non-veg, **Special**) ₹650/kg [dairy]; egg biryani (egg) ₹420/kg [egg, dairy]. Snacks: mirchi bajji ₹15/piece (50 g). Savouries: sakinalu ₹460/kg [sesame]. Sweets: double ka meetha ₹560/kg [wheat, dairy, nuts] | 15 kg a day. Delivery only. Every day |
| Puneri Misal House | Kothrud, Pune (18.5074, 73.8077) | Marathi | Meals: misal pav ₹110/plate [wheat]; mutton tambda rassa (non-veg) ₹1,150/kg. Snacks: sabudana vada ₹20/piece [peanuts]. Savouries: bhakarwadi ₹450/kg [wheat, sesame]. Sweets: puran poli ₹45/piece [wheat, dairy] | 20 orders a day. Closed on Mondays |
| Mashi's Rannaghar | Ballygunge, Kolkata (22.5262, 88.3639) | English | Snacks: egg roll (egg) ₹60/piece [wheat, egg]; chicken kathi roll (non-veg) ₹90/piece [wheat]. Meals: macher jhol, fish curry (non-veg) ₹180/plate [fish]; luchi aloor dom ₹90/plate [wheat]. Sweets: nolen gurer sandesh (**Special**) ₹30/piece [dairy] | 25 orders a day. Closed on Thursdays |

## Demo caterer: Daawat Caterers

Service styles: delivery only, with serving staff, with live counters. Delivery is the package price. On the Silver and Gold plates, serving staff adds ₹40 a plate and live counters add ₹75 a plate; the Buffet price is on request, so it adds nothing. Closed date: the coming Sunday ("Booked").

**Silver plate**: ₹350 a plate, from 100 plates. Total: up to 9 dishes.

| Category | Min | Max | Dishes |
|---|---|---|---|
| Sweets | 1 | 2 | Gulab jamun (Jain), Mysore pak (Jain), Kesari bath (Jain), Payasam (Jain) |
| Starters | 0 | 2 | Gobi manchurian, Paneer tikka, Veg cutlet |
| Mains | 2 | 3 | Bisi bele bath, Paneer butter masala, Veg kurma, Dal tadka |
| Breads | 1 | 1 | Poori (Jain), Chapati (Jain), Butter naan |
| Rice | 1 | 2 | Jeera rice (Jain), Curd rice (Jain), Lemon rice |

**Gold plate**: ₹500 a plate, from 100 plates. Total: up to 13 dishes. The same dishes, with these limits: sweets 1 to 3, starters 0 to 3, mains 2 to 4, breads 1 to 2, rice 1 to 2.

**Buffet**: "Price on request", from 150 guests, free choice.

All dishes are veg. Test for the plate rules: a host on the Silver plate picks a third sweet. The app shows "This plate allows 2 sweets" and offers the Gold plate. Test for a change of package: a host on the Buffet picks 4 sweets, then chooses the Silver plate. The app shows "This plate allows 2 sweets", "Remove 2" on Sweets, and offers the Buffet. Test for the service price: 120 plates of the Gold plate with serving staff show "120 plates × (₹500 + ₹40) = ₹64,800".

## Demo board post

- Company: "A tech company in Whitefield" (name hidden).
- Visitors can read the demo post and contact its stores, but not change, close or reopen it.
- Items: kaju katli, 1,000 pieces; Diwali assorted box (500 g), 500 boxes.
- Need by: 10 days after the seed day.
- Places: the Whitefield office and the Bellandur office.
- Budget: ₹250 a unit.
- Interested store: Ghar Ki Mithai, with the note "We can do both. Samples on WhatsApp."

## Voice lines

Each order is for Shobha's Kitchen (or `test-kitchen`, which has the same menu). `fixtures/sarvam/voice-lines.json` holds the same lines, with their language codes. The Kannada, Hindi and English lines, as text, also feed the load script (`scripts/load.ts`).

The repository has no real voice recordings. The six files `fixtures/sarvam/audio/synthetic-*.wav` (VK1, VH1, VE3, VM1 in two parts, and VS4) are short generated tones, not speech, for the tests. Their saved speech-to-text answers are hand-written placeholders that give the text of the line. To record real audio, a person reads each line once, with consent (README.md, "Plug in the services").

### Kannada

| ID | Line | Expected order |
|---|---|---|
| VK1 | ನಮಸ್ಕಾರ, ಶನಿವಾರಕ್ಕೆ ಒಂದು ಕೆಜಿ ಮೈಸೂರು ಪಾಕ್ ಮತ್ತು ಅರ್ಧ ಕೆಜಿ ಚಕ್ಕುಲಿ ಬೇಕು. ನನ್ನ ಹೆಸರು ಪ್ರಿಯಾ, ಜಯನಗರಕ್ಕೆ ಡೆಲಿವರಿ ಮಾಡಿ. | Mysore pak 1 kg, chakkuli 500 g, Saturday, Priya, delivery to Jayanagar |
| VK2 | ಭಾನುವಾರ ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ ಬೇಕು. ನಾನೇ ಬಂದು ತಗೊಂಡು ಹೋಗ್ತೀನಿ. ಹೆಸರು ಸುರೇಶ್. | Kaju katli 2 × 1 kg, Sunday, Suresh, pickup |
| VK3 | ನಾಳೆಗೆ ಒಂದು ದೀಪಾವಳಿ ಸ್ವೀಟ್ ಬಾಕ್ಸ್, ಒಂದು ಕೆಜಿದು, ಮತ್ತೆ ಕಾಲು ಕೆಜಿ ಕೋಡುಬಳೆ. ಮಲ್ಲೇಶ್ವರಂಗೆ ಕಳಿಸಿ, ಹೆಸರು ಅನಿತಾ. | Assorted box 1 kg, kodubale 250 g, tomorrow, Anita, delivery to Malleshwaram |
| VK4 | ಶುಕ್ರವಾರ ಅರ್ಧ ಕೆಜಿ ಬೇಸನ್ ಲಡ್ಡು, ಅರ್ಧ ಕೆಜಿ ಕೊಬ್ಬರಿ ಮಿಠಾಯಿ. ಸಕ್ಕರೆ ಸ್ವಲ್ಪ ಕಡಿಮೆ ಹಾಕಿ. ಹೆಸರು ರಮೇಶ್, ಪಿಕಪ್. | Besan laddu 500 g, kobbari mithai 500 g, Friday, note "less sugar", Ramesh, pickup |
| VK5 | ಮುಂದಿನ ಮಂಗಳವಾರ ಮೂರು ಕೆಜಿ ನಿಪ್ಪಟ್ಟು ಬೇಕು. ಬಸವನಗುಡಿಗೆ ಕಳಿಸಿ. ಹೆಸರು ಕಾವ್ಯ. | Nippattu 3 × 1 kg, next Tuesday, Kavya, delivery to Basavanagudi |
| VK6 | ಇವತ್ತು ಸಂಜೆ ಒಂದು ಕೆಜಿ ಚಕ್ಕುಲಿ ಸಿಗುತ್ತಾ? ಹೆಸರು ವಿನಯ್. | Chakkuli 1 kg, today, Vinay, pickup or delivery not said |

### Hindi

| ID | Line | Expected order |
|---|---|---|
| VH1 | नमस्ते, शनिवार के लिए एक किलो काजू कतली और आधा किलो बेसन लड्डू चाहिए। मेरा नाम रोहित है, HSR लेआउट में डिलीवरी कर दीजिए। | Kaju katli 1 kg, besan laddu 500 g, Saturday, Rohit, delivery to HSR Layout |
| VH2 | रविवार को दो दिवाली स्वीट बॉक्स चाहिए, आधे-आधे किलो वाले। मैं खुद ले जाऊँगी। नाम पूजा। | Assorted box 2 × 500 g, Sunday, Pooja, pickup |
| VH3 | कल के लिए पाव किलो मैसूर पाक और पाव किलो चकली। नाम अमित, कोरमंगला में भेज दीजिए। | Mysore pak 250 g, chakkuli 250 g, tomorrow, Amit, delivery to Koramangala |
| VH4 | शुक्रवार को डेढ़ किलो कोडुबले चाहिए। नाम सीमा, पिकअप। | Kodubale 1 kg + 500 g, Friday, Seema, pickup |
| VH5 | अगले बुधवार दो किलो निप्पट्टू और एक किलो नारियल बर्फी। नाम विकास, इंदिरानगर। | Nippattu 2 × 1 kg, kobbari mithai 1 kg (from "coconut burfi"), next Wednesday, Vikas, delivery to Indiranagar |
| VH6 | आज शाम तक आधा किलो काजू कतली मिल सकती है? नाम नेहा। | Kaju katli 500 g, today, Neha, pickup or delivery not said |

### English

| ID | Line | Expected order |
|---|---|---|
| VE1 | Hi, I'd like one kilo of Mysore pak and half a kilo of kaju katli for Saturday. Delivery to Jayanagar 4th Block, name Arjun. | Mysore pak 1 kg, kaju katli 500 g, Saturday, Arjun, delivery to Jayanagar |
| VE2 | Can I get two Diwali assorted boxes, one kilo each, for Sunday? I'll pick them up. This is Meera. | Assorted box 2 × 1 kg, Sunday, Meera, pickup |
| VE3 | Three hundred grams of chakli for tomorrow, please. Name Kiran, delivery to BTM Layout. | Chakkuli 250 g, marked as a near match for 300 g, tomorrow, Kiran, delivery to BTM Layout |

### Mixed speech

| ID | Line | Expected order |
|---|---|---|
| VM1 | Hi aunty, Sunday ko 2 kg kaju katli aur 1 kg chakli chahiye, Koramangala delivery, naam Neha. | Kaju katli 2 × 1 kg, chakkuli 1 kg, Sunday, Neha, delivery to Koramangala |
| VM2 | Aunty, Friday ge one kg besan laddu and half kg kodubale beku, Basavanagudi delivery, name Arjun. | Besan laddu 1 kg, kodubale 500 g, Friday, Arjun, delivery to Basavanagudi |
| VM3 | Kal ke liye ek Diwali box 1 kg wala, aur pav kilo nippattu, pickup karunga, naam Rahul. | Assorted box 1 kg, nippattu 250 g, tomorrow, Rahul, pickup |
| VM4 | Saturday ge Mysore pak 2 kg, coconut burfi half kg, Jayanagar ge kalsi, name Deepa. | Mysore pak 2 × 1 kg, kobbari mithai 500 g, Saturday, Deepa, delivery to Jayanagar |
| VM5 | Bhaiya, Tuesday ko kodubale aur nippattu dono ek-ek kilo, thoda kam teekha please, naam Sanjay, pickup. | Kodubale 1 kg, nippattu 1 kg, Tuesday, note "less spicy", Sanjay, pickup |

## Setup lines

For tests of item reading in seller setup, by voice or by text. `fixtures/sarvam/setup-lines.json` holds the same lines. Item suggestions from Sarvam are on the roadmap (README.md, "Roadmap"), so a line with no item gives the item form.

| ID | Line | Expected result |
|---|---|---|
| VS1 | ನಾನು ಮನೆಯಲ್ಲಿ ಸಿಹಿ ತಿಂಡಿ ಮತ್ತು ಖಾರ ತಿಂಡಿ ಮಾಡ್ತೀನಿ. | No item: the page asks for the name and the price again, or the item form |
| VS2 | ಚಕ್ಕುಲಿ, ಕೆಜಿಗೆ ನಾನೂರು ರೂಪಾಯಿ. | Item reading: ಚಕ್ಕುಲಿ (Chakkuli), savouries, veg, 250 g ₹100, 500 g ₹200, 1 kg ₹400 |
| VS3 | मैं घर पर मिठाई और नमकीन बनाती हूँ। | No item: the page asks for the name and the price again, or the item form |
| VS4 | Kaju katli, twelve hundred rupees a kilo, veg, contains nuts. | Item reading: Kaju katli, sweets, veg, 250 g ₹300, 500 g ₹600, 1 kg ₹1,200, contains nuts |
| VS5 | बेसन लड्डू, पच्चीस रुपये का एक पीस, शुद्ध घी वाले। | Item reading: बेसन लड्डू (Besan laddu), sweets, veg, 1 piece ₹25, 6 pieces ₹150, 12 pieces ₹300, contains dairy |
