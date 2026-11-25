---
title: Concept
purpose: What the product does, for whom, and why, and which parts this build leaves out.
read-when: You build or change a screen, a user flow or a product rule.
owns: terms, product, earning model, problem, persona, user flows, product rules, product scope
---

# Concept

This doc is the product vision. It drove the design of this build. "Roadmap" marks each part that this build does not have: a heading ends with "(roadmap)", or a line starts with "Roadmap:". "What this build leaves out", at the end, gives the summary.

## Terms

| Term | Meaning |
|---|---|
| Seller | A home cook, a small food seller or a caterer. Our customer. |
| Cook | The word that buyers see for a seller, for example "Cooks near you". |
| Buyer | A person who buys from a seller: a consumer, a company buyer or an event host. |
| Store | The page of one seller. One verified number has one store. |
| Desk | The pages where the seller runs her store and her orders. |
| Order | A food order from a consumer. It has a day, a status and a total. |
| Order slip | One order on the order board of the desk, with its number. |
| Quote request | A bulk or catering request. It is not an order and has no payment. |
| Board post | A bulk request that a company posts on the request board. |
| Item, pack | An item is a dish. A pack is one size of an item with its price, for example 500 g for ₹450. |
| Daily limit | How much the seller can make on one day, in orders, kg or pieces. |
| Code | A 6-digit verification code for a WhatsApp number or an email address. |
| Reading | Sarvam changes a voice note or a text into a draft: an order, a cart or an item. |
| Status badge | A fixed label that tells the truth about a screen: "Demo", "Prototype", "Recorded" or "Translated". |

## Product

- One web app for Indian food for festivals, weddings and parties. Food only.
- A seller makes one store. Buyers find it in the marketplace or open the seller's link.
- There are three ways to buy:
  1. **Order food**: a consumer orders and pays online or in cash.
  2. **Bulk and corporate**: a company asks stores for a bulk order, for example festival gifts.
  3. **Catering**: an event host asks a caterer for a plate or buffet package.
- Food orders are real orders. Bulk and catering requests are quote requests: the app connects the buyer and the seller, and they agree the deal themselves.
- The app works for each festival.
- The app is free for sellers and buyers. Later, it can earn from a small fee on online payments, or from a paid plan for bulk and catering leads.

## Problem: the pre-order rush

In the weeks before a festival, a home food seller gets a flood of orders. The rush has four marks:

1. Deadline: the orders are due before one fixed day.
2. Limit: there are more orders than she can make each day.
3. Messy orders: most orders come as WhatsApp voice notes and texts, in many languages.
4. Peak: all sellers get their rush at the same time.

These marks do not occur in an ordinary week. The same problem occurs for a home cook before Diwali, a baker before Christmas and a snack maker before Sankranti. In the same weeks, companies buy festival gifts in bulk, and the wedding season starts.

## Persona

- Shobha is a home cook in Bengaluru. She is a composite, not a real person. She makes festive sweets and savouries at home. She uses a mid-range Android phone in a bright, busy kitchen. Her buyers send orders on WhatsApp in Kannada, Hindi, English and mixed speech.
- Consumers order on a phone, often from a WhatsApp link. Company buyers and event hosts often use a laptop.

## Ways in

- Homepage: three tabs, shown as cards: **Order Here** (order food from home cooks), **Corporate Bulk Orders** (bulk and corporate) and **Catering Servicing** (catering). Each tab has its own search and listings, for the city in the app bar.
- Seller's link: a QR code or a WhatsApp link from the seller. It opens only her store, with each section that she turned on. It shows no marketplace and no other sellers.

## Seller: setup

To publish, she gives only the minimum:

1. Her language. The app then shows its words in her language.
2. What she sells: her items, one at a time, in her own words, typed or said, for example "Kaju katli, 1200 rupees a kilo, veg, contains nuts". The app fills in the item, and she checks each value. She can also fill in the item form herself.
   - Roadmap: the app suggests common items as quick buttons, in her language. She touches each item that she sells. The buttons change as she adds items.
3. For each item: a name, one or more packs with prices, a veg, non-veg or egg mark, and what it contains, for example nuts or dairy. For a name in another script, the app adds the name in English letters. From one price, the app suggests packs, for example 250 g ₹100, 500 g ₹200 and 1 kg ₹400. She removes or changes any pack. An item can be an assorted box: she lists its contents as text.
4. A category for each item: sweets, snacks, savouries or meals. When the app reads an item, it selects the category from the item name. She can change it. Her store shows her items in sections by category.
5. The store name. Her store link comes from it, for example `/s/shobhas-kitchen`. The app checks that the link is free. A cover photo is optional, and it is her own photo.
6. Pickup, delivery or both.
7. Where she cooks: her area and city, and optionally her pickup address and a pin from **Use my location**. Buyers see only her area and the distance. A buyer sees the pickup address only after a pickup order.
8. A preview of her store as buyers see it.
9. Publish: she verifies her WhatsApp number with a code. She agrees to get order and request updates on WhatsApp, and she agrees that she is responsible for her food and its safety.
10. Share: **Share on WhatsApp**, her QR code, or **Copy link**.

Before she publishes, she needs no account. Her draft stays in her browser.

## Seller: "Make your store better" (roadmap)

A checklist on her desk. Each step is optional:

- Photos: a cover photo and photos of items.
- Allergens for each item, for example nuts or dairy.
- Working days. The default is every day.
- Rush settings: the daily limit with its unit (orders, kg or pieces), and the last day for orders. For a kg limit, each pack has a weight. For a pieces limit, each pack has a number of pieces.
- Online payments. Then **Ask strangers to pay online**: a buyer from the marketplace must pay in advance. A buyer from her own link can still pay in cash.
- **Show my store in the marketplace**, with her FSSAI number. The app checks that it has 14 digits. Without the number, the store does not show in the three tabs. Her own link works without it.
- **Bulk and corporate orders**: one line, for example "Bulk and corporate orders taken", and her bulk items. Each bulk item has a minimum quantity and a price per piece or per kg, or "Price on request". An item can be in her normal menu, in her bulk section, or in both.
- **Catering packages**: see "Catering".
- Normal orders on or off. A caterer can take only catering, or only bulk.
- Save the WhatsApp number of the app as a contact, to forward orders to it.

Where this build has these settings:

- Setup has the cover photo and the allergens of each item.
- The **Catering packages** page of the desk (`/desk/packages`) has her packages and the switch **Show catering on my store**.
- The demo stores get their working days, daily limit, online payments, marketplace and FSSAI number, bulk section and normal orders from their seed data (`docs/demo-data.md`).
- A new store keeps the defaults: no daily limit, no last day for orders, every day a working day, no online payments and no bulk section. It does not show in the marketplace, so buyers open it from her link.

## Order food: search

1. The **Order Here** tab shows:
   - a search box with a mic and a **Filters** button: **Need it by**, food type, sort and category, in a panel under the box. The button says how many filters are on.
   - the cooks of the city as cards.
   - Roadmap: a link to **My orders**.
2. Results start for the whole city. For the nearest cooks, the buyer touches **Use my location** in the **Filters** panel. The app then selects her city and puts the nearest cooks first.
3. The buyer types a dish or a cook, or says a dish, in any language or script. The results update as she types. "kaju katli", "ಕಾಜು ಕಟ್ಲಿ" and "काजू कतली" give the same results.
4. **Need it by** shows only cooks with space on or before that day. If no cook nearby has space, the results show the cooks with the nearest later dates.
5. Filter: veg, non-veg or egg, and the category. Sort: nearest first (the default with location) or best rated first (the default without location). Without her location, nearest first measures from the centre of the city. Cooks with no rating yet come after the rated ones.
   - Roadmap: real ratings, from reviews. In this build, only the demo stores have stars, and the stars are made-up demo data (`docs/demo-data.md`).
6. Each cook card shows the area, the distance (when known) and the kind of shop, her stars ("★ 4.8", or "New"), the store name, up to 3 dishes (the matching ones first) with the mark, the pack size and the price, a **+ N more dishes** link to her store, and her next day with space ("Available: Today", or another day), or that she has no space in the next 3 weeks. A paused store, or a store after its last day for orders, shows grey with "Not taking orders now".
7. The buyer touches a card to open the store.

## Order food: store page

1. Top: the cover photo, the store name, and whether she takes orders now.
2. Store information: her stars, her area and city, pickup or delivery, the next day with space, the last day for orders, the FSSAI number, and a **Share** button.
   - Roadmap: her reviews.
3. Items in sections by category. Each item shows its mark and its allergens. A box shows its contents.
4. The buyer selects a pack and touches **Add**. Then it changes to **− 1 +**.
5. A sold-out item shows grey. The buyer cannot add it.
6. Voice: the buyer touches **Record your order** and says the order, or she chooses a voice note. The app adds the fewest packs that make each amount, for example 2 × 1 kg for "2 kilo". If no packs make the exact amount, the app adds the nearest packs and marks them. If she says a day, the cart takes that day. The buyer checks the cart. **Undo** takes the added packs out.
7. Each cook has her own cart. Items from two cooks make two orders.
8. Day: the buyer picks one of her working days in the next 3 weeks. A day is available only if the whole cart fits in the space left on that day and the day is not closed. The page shows the next day with space. There is no time of day.
9. The cart, at the side of the page, shows the items, the total, the day and the **Order** button.
10. If she turned on bulk or catering, the store also shows those sections, each with **Contact seller**.

## Order food: checkout

1. Pickup or delivery, from what she offers. For delivery, the address. If she cannot deliver to an address, she cancels the order.
2. **Send as a gift** (delivery only): the receiver's name, and optionally the receiver's phone and a message that she writes on a card.
3. A note, for example "less sugar". She reads it in her language, with the original one tap away.
4. The buyer's name.
5. Payment: if she accepts online payments, the buyer selects **Pay online now** or **Pay later or in cash**. A later payment is online from the order page, or in cash. Online payment is required only for a marketplace buyer when she asks strangers to pay online.
6. Last step: the buyer's WhatsApp number and a code, for each order. One line names the app and says: "Plattr uses your number and address only for this order and its updates on WhatsApp." A link opens the privacy page, which lists the data, the purpose, how long the app keeps it, and how to withdraw consent or complain. A verified code is consent. The browser fills in the name and the number next time. There is no buyer account.
7. The buyer pays only the item prices. There are no fees.
8. The order is placed. If an optional payment fails, the order stays placed and unpaid. If the payment is required, the order is placed only after the payment succeeds.

## Order food: after the order

1. The order page shows the order number, the items, the total, the status, a **Pay online** button and **Message the store**. For a pickup order, it also shows her exact address and a map link.
2. Automatic WhatsApp messages go to buyers who gave consent, in the language of the page at checkout:
   - order placed: a summary, the order page link, and her address for pickup,
   - READY,
   - order changed,
   - order cancelled, with her reason.
   - Roadmap: a payment reminder, and a review link after completion.
3. Each message has **Message the store**, and says how to stop the messages. **Message the store** opens a WhatsApp chat with her number.
   - Roadmap: a reply to the number of the app gets an automatic answer with the same button.
4. To change or cancel, the buyer messages her. She edits the order. The buyer gets a message, and the order page shows the change.
5. If a paid order is cancelled, she decides about the refund and touches **Refund**.

## My orders and reviews (roadmap)

- **My orders** is on the homepage. The buyer opens it with a code. It shows each order, quote request and board post, with its status, and **Order again**.
- The buyer can delete their orders, requests and number there. Open orders stay until they are complete.
- Review: only for a complete order (DELIVERED or PICKED UP), one time for each order. It has 1 to 5 stars and a short text. It shows the buyer's first name and, for a delivery order, the area, for example "Priya, Jayanagar".
- Before a review shows, an automatic check hides an abusive review.
- The seller can write one public reply under each review.

## Bulk and corporate

Nothing is ordered or paid here.

- Bulk stores: the buyer searches the bulk items, and sees the stores with a bulk section, their bulk items, minimum quantities, and prices or "Price on request". The buyer adds items and quantities to a bulk cart, which shows an estimate, and touches **Contact seller**. Each store gets its own request.
- Request board: a company writes a board post with items and quantities, a need-by date, one or more delivery places, and an optional budget per unit. To post, the company verifies a work email address and a WhatsApp number with codes. It shows its name or only a description, for example "A tech company in Whitefield". Only the link of the board post shows the stores that answer, so the company keeps it.
- Stores with a bulk section see the request board for their city.
  - Roadmap: stores that sell the items and are near a delivery place also get a WhatsApp message.
- A store answers **I can do this**, with an optional typed note.
  - Roadmap: she says the note.
- Only the company sees the stores that answered and their notes, in its language. It touches **Contact seller** on the store that it likes.
- The company can edit its board post until the post closes. A board post closes when the company closes it or after the need-by date. Before the need-by date, the company can open a closed post again.

## Catering

Nothing is ordered or paid here.

The caterer makes packages on the **Catering packages** page of her desk:

- Plate package: a price per plate and a minimum number of plates, for example ₹350 a plate, from 100 plates.
- Buffet package: a price per guest and a minimum number of guests.
- Or "Price on request".
- The price covers each choice of dishes within the rules. No dish costs extra.
- Categories, for example sweets, starters, mains, breads and rice. Each category has its dishes, a minimum and a maximum, for example sweets 1 to 2. The package has a maximum total, for example 9 dishes. Or "Free choice", with no limits. Each dish has its mark, and a veg dish can be Jain.
- Service styles: delivery only, with serving staff, or with live counters. Serving staff and live counters can add an extra price per plate or guest.
- When she agrees an event, she closes that date. Hosts see the date as "Booked".

The event host:

1. Searches the **Catering Servicing** tab by event date (booked caterers do not show), food type (veg, non-veg, Jain or mixed), number of guests (only packages whose minimum fits), and price per plate or per guest. Caterers have no ratings.
2. Opens a package of a caterer, and picks dishes in each category.
3. Over a limit: the app does not add the dish. It shows the limit, for example "This plate allows 2 sweets", and her packages that allow the choice, for example "Gold plate: 3 sweets, 13 dishes, ₹500". One touch changes the package and keeps the dishes.
4. Under a minimum: the app shows how many dishes are still necessary.
5. Gives the event details: date, number of guests, place and service style. The page shows an estimate from the guests and the price.
6. Touches **Contact seller**.

## Contact seller

It works in the same way for a bulk cart, a board post answer and a catering plan:

1. The buyer verifies a WhatsApp number with a code.
2. The request goes to "Quote requests" on her desk: the items or the plan, the quantities, the date, the place and the buyer's contact.
3. **Send on WhatsApp** opens WhatsApp with the same summary, to her number. The buyer sends it.
4. They agree the price and the deal themselves.

A quote request has no payment, does not count toward her daily limit, and does not allow a review.

## Seller: orders from WhatsApp

Many buyers still order on WhatsApp.

1. On her desk, in **Add order**, she records a phone order, chooses a voice note, or pastes a text.
   - Roadmap: she forwards the voice note or the text to the WhatsApp number of the app. The app knows her from her verified number and puts the order on her desk.
2. The app shows the words that it heard and the order that it understood. It reads voice notes of up to 5 minutes completely. It picks packs by the same rule as the voice order on the store page.
3. She corrects the order. If the app cannot read it, she fills in the order herself.
4. If the order does not fit in the space left on that day, the app warns her and shows the next day with space. She decides.
5. Roadmap: she adds the buyer's number from her contacts.
6. She saves the order.
7. To tell the buyer, she touches **Send on WhatsApp**. WhatsApp opens with a filled-in message and the order page link. She sends it from her own chat. The app sends no automatic messages to these buyers, because they gave no consent.

## Seller: desk

- Her browser only: the desk opens in the browser where she verified her WhatsApp number with a code. In another browser, she verifies again. There is no helper access.
- Order board: an order slip for each order, by day, for the next 3 weeks. Each day shows its load against her limit. A slip starts as NEW. One touch stamps the next status: MAKING, READY, then DELIVERED or PICKED UP. **Undo** takes a stamp back. Orders from the app arrive immediately.
- Edit: after an edit, the app checks the daily limit again.
- Cancel: she selects a reason: "Can't deliver to your address", "An item ran out", "The day is full" or "Other". The buyer gets the reason. The space goes back to the day.
- Paid: an online payment stamps PAID automatically. She touches **Mark paid** for cash.
- Refund: **Refund** on a paid order returns the full amount.
- Daily list (**Today's khata**): for each day, the load against her limit, the amount of each item to make, the number of orders, their value, what is paid and what is owed; and the totals for the last 30 days.
- Close a date: one touch on the daily list, for example for the festival day or a catering event.
- Sold out: one touch on an item in **Menu stock**. One more touch makes it available again.
- Pause: **Not taking orders now**, in **Menu stock**. The store stays visible.
- Quote requests: each request in her language, with the original one tap away. **Reply on WhatsApp** opens a chat with the buyer.
- Request board: shown when her bulk section is on.
- **Catering packages**: a desk page for her packages (see "Catering").
- Roadmap: she changes her store after she publishes: the name, the link (one time), the items, the packs and the prices. A new price applies only to new orders.
- Roadmap: a list of who owes, with each unpaid order, its amount and a reminder.
- Roadmap: a phone notification for each new order and each new quote request, also when the app is closed. On Android, one notification keeps the count, for example "12 new orders". On an iPhone, she first adds the desk to the Home Screen, and each order gets its own notification. She can turn them off.
- Roadmap: she reads the reviews and replies.
- Roadmap: the "Make your store better" checklist.
- Roadmap: she deletes her store and its data. Open orders stay until they are complete.

## Order book

- Orders from the marketplace, from her link and from her desk (the WhatsApp orders that she adds) go into one order book.
- Each order adds to the load of its day, in the unit of her limit.
- When a day reaches her limit, buyers cannot pick that day.
- For an agreed bulk or catering deal, she closes dates.
- Roadmap: she lowers her limit for an agreed deal.

## Language

- Every page opens in English. The seller or the buyer picks another language with the Language control of the app bar. The browser keeps the choice for the next visit.
- Item and dish names show in English end to end. On a page in another language, an item name shows in the script of that language first, then in English, for example "ಮೈಸೂರು ಪಾಕ್ · Mysore pak" or "मैसूर पाक · Mysore pak". With no name in that script, the English name shows alone. Store names and areas show as the seller typed them, in each language.
- Board posts, quote requests and notes reach the seller in her language. Her note on **I can do this** reaches the buyer in the buyer's language.

## Festive touches

- **Special** tag: special or limited items show first in her store, with the tag.
  - Roadmap: she sets the tag herself. In this build, only the demo menus have it.
- Roadmap: festive suggestions. Near a festival, the quick buttons also suggest common items for that festival.
- **Need it by**: buyers find the cooks who can still deliver before the festival.

## Product rules

1. The AI never speaks as the seller. Text about her store comes from her own words.
2. Each translation shows the "Translated" badge. The original text is one tap away.
3. Messages to buyers are fixed texts. The AI does not write them.
4. Photos are her own. The app never shows a stock picture as her product.
5. The seller can start without help. The first steps ask only for her language and what she sells.
6. The app never promises more than she can make. Only she can accept an order for a full day.
7. The app never loses an order. If voice fails, buyers use the list and the seller types the order.
8. Sign-up comes last. The seller verifies to publish. A buyer verifies at the last step of an order, a quote request or a board post.
9. Automatic WhatsApp messages go only to people who gave consent: buyers at checkout or at a request, sellers at publish.
10. Her exact address is private until a buyer places a pickup order. Her WhatsApp number shows only to buyers who verified an order or a request.
11. The app asks for the location of the device only after a person touches **Use my location**.
12. The FSSAI number shows as "given by seller", because the app checks only its 14 digits.
13. Roadmap: sellers and buyers can delete their data.

## Not in the product

- Non-food sellers.
- Orders and payments for bulk and catering.
- A chatbot or a chat inbox. Buyers and sellers talk on WhatsApp.
- Ratings for caterers. Made-up reviews.
- Extra-cost dishes in catering packages.
- GST invoices and GST tags.
- Helper access to the desk. Admin controls.
- Delivery areas, delivery charges, distance limits, delivery routes, a time of day and a notice period.
- Minimum order values, buyer fees, discounts and coupons.
- Automatic refunds and part refunds.
- Buyer accounts, passwords and saved cooks.
- Blocking a buyer.
- Order changes by voice, ingredient planning and sales charts.
- Sample requests. Buyers and sellers arrange samples on WhatsApp.
- Season pages.

## What this build leaves out

- The parts marked "Roadmap" in this doc. README.md ("Roadmap") has the list.
- Phone layouts. This build is a laptop website.
- Real WhatsApp codes and messages, real email codes and real payments. This build simulates them, with the "Prototype" badge (`docs/system.md`, "Prototype parts").
