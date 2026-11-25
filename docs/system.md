---
title: System
purpose: How the product is built: architecture, data, API, pipeline, flags, metrics and deploy.
read-when: You write or change server code, pages, data, flags, metrics, alerts, workflows or deploy files, or you run the experiment or the incident.
owns: architecture, deploy paths (Railway and k3s), prototype parts, pages, server modules, data, API, reading pipeline, flags, experiment run, metrics, alerts, NudgeBee workflows, incident runbook, codes, messages, payments, search, capacity, catering rules, festivals, language implementation, security, demo mode, configuration, recorded mode, credit budget, deployment, tests, packages, repository layout
---

# System

The stack rules are in `AGENTS.md` ("Stack"). The product behaviour is in `docs/concept.md`. This file gives the implementation. The features that are not built are in `README.md` ("Roadmap").

## Architecture

- One container serves the built pages, the JSON API under `/api`, `/metrics`, `/healthz` and `/readyz`.
- Each page has its own `main.ts`. The UI of each page is known before run time, so it is written in HTML. The data comes from the API.
- The desk gets new orders and quote requests through Server-Sent Events (`GET /api/desk/events`).
- SQLite (`better-sqlite3`, WAL mode) is the file `app.db` in `DATA_DIR`. Photos are files in `DATA_DIR/photos`. `DATA_DIR` must be on a persistent volume (see "Deployment").
- Browsers allow the microphone only in a secure context (HTTPS or localhost), so each deploy path serves HTTPS.
- Live services: Sarvam (or recorded mode) and Flagsmith (or the flag defaults in code).
- Two deploy paths run the same image (see "Deployment"):
  - Railway runs the live app: one container, built from the `Dockerfile`, on the HTTPS domain of Railway.
  - k3s is the path for a NudgeBee tenant, because the NudgeBee agent runs in a cluster.
- The k3s design:
  - One VM runs k3s. Its disk must hold the NudgeBee storage claims (`docs/nudgebee.md`, "Agent install").
  - The VM has a reserved static IP address. An ephemeral address changes when the VM stops, and that changes the hostname and the certificate.
  - Open ports: 22 (SSH for the deploy), 80 and 443. The k3s API (port 6443) stays closed.
  - The address is the sslip.io hostname of the static IP, for example `34-12-56-78.sslip.io`. cert-manager gets the Let's Encrypt certificate. The Traefik ingress of k3s serves HTTPS.
  - The NudgeBee script installs kube-prometheus-stack and the NudgeBee agent in the cluster.

## Prototype parts

This build simulates the services that need business approval or money. Each simulated part shows the "Prototype" badge.

| Part | This build | Full product |
|---|---|---|
| WhatsApp codes (seller, buyer) | The code shows on the screen | WhatsApp Business Platform |
| Automatic WhatsApp messages | The message log. The order page and the desk show it | WhatsApp Business Platform |
| Work email codes | The code shows on the screen | An email service |
| Payments and refunds | The `/pay/:token` screen with **Pay** and **Fail** | Razorpay test mode (on the roadmap) |
| NudgeBee investigation, approval and rollback | The **NudgeBee** section of the developer console (`/ops`): our own metrics, the condition of `ReadingInvalidRateHigh`, a fixed investigation text, **Approve** or **Reject**, then the same `ops_reading` change as `nudgebee/rollback-lang-kn.yaml` (through Flagsmith when the server has the rollback settings of "Configuration", else an in-memory override) | A NudgeBee tenant with its agent in the cluster, and the files in `nudgebee/` loaded with `nbctl` |

- Forwarding to the app number is not in this build. The seller uploads or records the voice note on her desk instead. The upload is real, so it shows no badge.
- **Send on WhatsApp**, **Message the store** and **Contact seller** are real. Each one opens WhatsApp through a plain `wa.me` link (see "Messages").

## Pages

| Path | Page | User |
|---|---|---|
| `/` | Homepage: tabs **Order food**, **Bulk and corporate**, **Catering** | Buyer |
| `/s/:slug` | Store page. Marketplace results link to `/s/:slug?via=market` | Buyer |
| `/s/:slug/checkout` | Checkout | Buyer |
| `/o/:token` | Order page | Buyer |
| `/pay/:token` | Prototype payment screen for the order with this token: the amount, the time left to pay, **Pay** and **Fail** | Buyer |
| `/board-posts/new` | Write a board post, then verify the work email and the WhatsApp number with codes | Company buyer |
| `/board-posts/:token` | The company's link to its board post: edit, close or reopen it; the stores that answered, with their notes; **Contact seller**. The token is the secret of the link | Company buyer |
| `/c/:slug/:package` | Catering plan builder: dishes within the plate rules, the other packages that allow a refused dish, the event details, **Contact seller** | Event host |
| `/sell` | Seller setup, in steps: language, what she sells, name and link, pickup or delivery, preview, publish (her WhatsApp code), share (the link and the QR code). The page keeps her draft until she publishes | Seller |
| `/desk` | Desk: order board, quote requests, request board (when her bulk section is on), add order, stock (sold out, pause), and the daily list (what to make, the money of the day and of the last 30 days, close a day) | Seller |
| `/desk/packages` | Catering packages: the catering switch; add, change or remove a package. The desk links to it when catering is on | Seller |
| `/desk?demo=<token>` | The demo desk. The token is the secret `DEMO_DESK_TOKEN` | Visitors |
| `/demo` | The start page for visitors, in English: one card for each side to try, and each link opens in a new tab. **Open the demo desk** and **Open the developer console** go to `/demo/desk` and `/demo/ops`, which redirect to the page with `DEMO_DESK_TOKEN` (without the token, to the page alone), so the token is not in the page or in git. Anyone with the start page can open the demo desk | Visitors |
| `/ops` | Developer console, for the team, not for sellers or buyers. Three sections: **Flagsmith** (the connection, with each key named only as set or not set; each flag with its kind, its value and its default in code; the decision of each language segment for a preview order, which records no exposure; the in-memory overrides; the experiment with the exposures and conversions counted since the server started), **NudgeBee** (the simulated incident, "Prototype parts", with the alert rule names and the workflow files), first by default, and **Sarvam** (the mode, the saved answers and placeholders in `fixtures/sarvam/`, the calls, outcomes and billed units since the server started). The fragment keeps the section (`#flagsmith`, `#nudgebee`, `#sarvam`). It opens with the demo desk token only: `/ops?demo=<token>`, or a tab that holds it | Team |
| `/privacy` | Privacy page. The contact for complaints comes from `GET /api/privacy` | All |

- Each page except `/privacy` has one speculation rules block: `prerender` for same-origin links other than `/api/*`, with `eagerness: "conservative"` (it starts on pointer down). A page writes nothing on load, and no link changes state, so a prerender has no side effect.
- Each page opts in to cross-document view transitions (`@view-transition { navigation: auto; }` in `src/styles/base.css`), except when `prefers-reduced-motion` is set. The shared elements are in `docs/design.md` ("Interaction and motion").
- Checkout sends `via`. The server sets `source` (`marketplace` or `link`) from it. A marketplace order to a store that accepts online payments and asks strangers for an advance gets `payment_required`.
- **My orders** for buyers, and web push for the desk, are on the roadmap (`README.md`, "Roadmap").

## Server modules

One folder for each feature in `server/`. `app.ts` registers the routes, and `main.ts` starts the server. Shared zod schemas, types, the city table and the festival list are in `shared/`.

| Module | Job |
|---|---|
| `http/` | The JSON log line of each request (with the request ID and the flag variants), rate limits, errors, input checks, idempotency keys |
| `lifecycle/` | `/healthz`, `/readyz`, and the drain on SIGTERM |
| `db/` | Opens SQLite (WAL, foreign keys, busy timeout) and runs the migrations |
| `pages/` | Serves the built pages and their static files |
| `stores/` | Seller setup (store, menu, cover photo, link check and suggestion), publish, QR code, store page, sold out, pause, closed days |
| `catalog/` | Search: the search form, the FTS5 index and its queue, voice search, distance, **Need it by**, sort, the cook cards |
| `capacity/` | Pure functions: units, load, fits, next free day |
| `orders/` | Cart checks, checkout, the order board and the daily list of the desk, desk orders, stamps, edit, cancel, undo, the delayed READY message |
| `reading/` | The reading pipeline for orders, carts and items: WAV checks, voice parts, prompts, packs, day words |
| `sarvam/` | Sarvam seam (live or recorded), clients, metrics |
| `outbound/` | `fetch` with a timeout, and retries with backoff, jitter and `Retry-After` |
| `flags/` | Flagsmith client, the defaults in code, the decisions for each request, experiment events and their count for `/ops`, the in-memory segment overrides of `/ops` |
| `verify/` | Codes, sessions, the desk and seller checks |
| `messages/` | Message templates, the simulated sender, `wa.me` links |
| `payments/` | The `mock` provider: payments, **Pay** and **Fail**, refunds, the 15-minute expiry sweep |
| `bulk/` | Bulk stores, board posts and their work email codes, interests, the request board of the desk |
| `catering/` | Packages and their desk editor, the **Catering** tab search, plate rules and food type matches (pure functions) |
| `cities/` | `GET /api/cities`: the cities of the marketplace stores for the city picker |
| `quotes/` | Contact seller: quote requests for a bulk cart, a catering plan or a board post answer, and their list on the desk |
| `translate/` | The translation cache; translations of notes, board posts and quote requests; item names in the buyer's script; Latin forms of item names |
| `privacy/` | `GET /api/privacy`: the contact of the privacy page |
| `ops/` | The developer console of `/ops`: the flags and Sarvam reports, and the simulated NudgeBee incident (the alert condition from our own metrics, the approval steps, the rollback) |
| `events/` | Server-Sent Events for the desk |
| `metrics/` | Prometheus registry, HTTP metrics, `/metrics` |
| `demo/` | Demo seed, daily refresh, the pack rule, demo desk link, the redirects of the start page for visitors |

## Data

SQLite tables. Money is in paise (integers). Dates are calendar days in IST. The header of `server/db/migrations/001-must-tables.sql` gives the encodings of ids, times, days, phones, languages, working days, limits and allergens. A store is public once its seller is verified (`sellers.verified_at`, set at publish).

- `sellers`: id, phone, language, verified_at.
- `stores`: id, seller_id, slug, name, cover_photo, area, city, address (private), lat, lng, offers_pickup, offers_delivery, accepts_online, advance_for_strangers, in_marketplace, fssai, normal_orders_on, bulk_on, bulk_line, catering_on, paused, limit_unit (`orders`, `kg`, `pieces`), daily_limit, last_order_day, working_days, slug_changed, is_demo, rating_average and rating_count (`NULL` and 0: no rating).
- `items`: id, store_id, name, name_latin, category (`sweets`, `snacks`, `savouries`, `meals`), veg_mark (`veg`, `non_veg`, `egg`), allergens, box_contents, photo, special, sold_out, in_menu, in_bulk, bulk_min_qty, bulk_unit (`pieces`, `kg`), bulk_price.
- `packs`: id, item_id, label, grams, pieces, price.
- `closed_dates`: store_id, date.
- `codes`: id, target (phone or email), purpose, code_hash, expires_at, attempts.
- `sessions`: id, kind (`seller`, `buyer`), subject, expires_at.
- `orders`: id, store_id, number, token, source (`link`, `marketplace`, `desk`, `load`), status (`awaiting_payment`, `new`, `making`, `ready`, `delivered`, `picked_up`, `cancelled`, `expired`), fulfilment, address, gift_name, gift_phone, gift_message, note, note_language, buyer_name, buyer_phone, buyer_language, day, total, paid, payment_required, cancel_reason, transcript, reading_language, reading_variant, edited, created_at, refund_amount (paise: the last refund, cash or online; `NULL` until a refund), refund_online (the refund gave back the simulated online payment).
- `order_items`: order_id, item_id, pack_id, quantity, price, grams, pieces.
- `messages`: id, order_id or request_id, to_phone, template, language, body, channel (`simulated`, `whatsapp`), created_at.
- `payments`: id, order_id, provider (`mock`, `razorpay`), status (`started`, `paid`, `failed`), amount (the order total when the payment started), refunded (the money given back), created_at, updated_at.
- `packages`: id, store_id, kind (`plate`, `buffet`), name, price (`NULL`: "Price on request"), min_count, free_choice, max_total, service_styles, position, staff_extra and counters_extra (what serving staff and live counters add to each plate or guest).
- `package_categories`: id, package_id, name, min, max, position.
- `package_dishes`: id, category_id, name, veg_mark, jain, position.
- `board_posts`: id, token (the secret of the company's link), buyer_phone, work_email, company_name (`NULL`: only the description shows), description, items, need_by, places, budget_per_unit, city, status (`open`, `closed`), language, is_demo, created_at, updated_at.
- `board_interests`: board_post_id, store_id, note, note_language, created_at.
- `quote_requests`: id, store_id, kind (`bulk`, `catering`, `board_post`), payload, buyer_name, buyer_phone, language, created_at.
- `translations`: hash, kind (`translate`, `transliterate`), model, source, target, text, created_at (a cache). The hash covers the kind, the model, the languages and the original text, so the original is not stored twice.
- `search_index`: an FTS5 table (see "Search"): form, words, kind (`item`, `store`), id, store_id.
- `search_stale`: kind, id. Triggers on `items` and `stores` queue each changed name here.
- `idempotency_keys`: key, scope, route, request_hash, response, created_at.

Photos are files in `DATA_DIR/photos`, named `<store id>-<8 hex digits>.<jpg|png|webp>`. Each upload gets a new name, so the bytes of a photo address never change. `stores.cover_photo` holds the address `/api/photos/<name>`. A new cover deletes the file of the old one.

Migrations are the files `server/db/migrations/NNN-name.sql`. Each runs once, in number order, in a transaction, and `user_version` keeps the last number. The numbers start at 1, with no gaps. 001 makes the core tables, 002 the idempotency scope and hash, 003 `payments`, 004 search, 005 `translations`, 006 the catering and quote tables, 007 the board post tables, 010 the refund columns of `orders`, 012 the store ratings, and 013 the service style prices of packages (it also takes the food type out of catering requests). 008, 009, 011 and 014 change nothing (`SELECT 1`). `/readyz` answers "ready" only when the database has the last version.

## API

Seller. Each route under `/api/desk/` needs the seller session (see "Codes and sessions").

- `GET /api/sell/read`: whether item reading is on (`reading`, from `ops_suggestions`), whether voice is on (`voice`, from `ops_voice`) and `recorded`. No account.
- `POST /api/sell/read/parts`: one WAV part, as `POST /api/desk/read/parts`, with no account: the uploads limit, an idempotency key in memory, bound to the body. Its parts belong to no store, and only an item reading can use them. With `ops_voice` or `ops_suggestions` off it gives 409 `voice_off`.
- `POST /api/sell/items/read`: one item from her voice or text: the part ids (in order, 11 at most) or a `text`, with the readings limit and no account. The answer has the transcript, the language, the path, the outcome, `show_manual`, `recorded`, `placeholder` and the `item`: name, Latin name, category, food mark, price (per kg or per piece, in paise), packs and allergens, each `null` or empty when she does not say it. With `ops_suggestions` off it reads nothing: the `manual` path, a 200 with `show_manual`. In recorded mode, a text or a part with no saved answer gives 422 `recording_missing`.
- `GET /api/sell/slugs/:slug?store=<id>`: whether a link is free (her own draft keeps its link), with a numbered suggestion when it is not.
- `GET /api/sell/slug-suggestion?name=<store name>`: a free link for her store name: its Latin letters, else the Latin form from Sarvam transliteration, else a made-up `store-xxxx`. The link is never empty.
- `POST /api/verify/start`, `POST /api/verify/check`: codes, then a session.
- Setup, with the seller session alone: `GET /api/desk/stores/:id`; `PUT /api/desk/stores/:id` makes or changes her store (language, name, link, area, city, address, pin, pickup or delivery), one store for each number; `PUT /api/desk/stores/:id/items` (the whole menu, 256 KB at most), `PUT /api/desk/stores/:id/items/:itemId`, `DELETE /api/desk/stores/:id/items/:itemId`; `PUT /api/desk/stores/:id/cover` (the raw JPEG, PNG or WebP file, 2 MB at most, whose first bytes must match its `Content-Type`), `DELETE /api/desk/stores/:id/cover`. An item that an order or her bulk section names leaves the menu but stays in the table. An item or pack id of another store gives 403.
- `POST /api/desk/stores/:id/publish` (idempotency key; `whatsapp_updates` and `food_safety` both `true`): her store goes public. It needs one item with a pack. The answer has the store link and the address of its QR code.
- `GET /api/desk/store`: her store, menu, closed days, her language and the flags of the desk. On the demo desk, `voice_samples` tells the page to offer the sample voice lines.
- `PUT /api/desk/items/:id/sold-out`, `PUT /api/desk/paused`, `PUT /api/desk/closed-dates/:day` (today to 366 days ahead). Each sets a state, so a retry does no harm.
- `GET /api/desk/packages`, `POST /api/desk/packages` (idempotency key; 10 packages at most), `PUT /api/desk/packages/:id`, `DELETE /api/desk/packages/:id`, `PUT /api/desk/catering` (the catering switch).
- `POST /api/desk/read/parts`: one WAV part (raw `audio/wav`, from 0.1 s to 30 s, 1 MB at most) gives its transcript, language and length. The length comes from the sample rate, channels and sample size; a header whose byte rate disagrees is refused. Each answer says `recorded` and `placeholder`.
- `POST /api/desk/read`: read an order from the part ids (in order, 11 at most) or from a text. An optional `language` field skips language identification. A failed reading is a 200 with `show_manual`. Parts live 15 minutes in memory: an expired part gives 410 `parts_expired`, and the page uploads it again.
- `POST /api/desk/orders`, `GET /api/desk/orders?from&to` (the board by day, 92 days at most), `PATCH /api/desk/orders/:id` with one `action`: `stamp` (one step forward, or one step back as an undo), `paid`, `cancel` with a reason, or `edit`. `POST /api/desk/orders/:id/refund`.
- Each stamp offers undo for 10 s. Cancel and refund are final on the server, so the desk holds them back for those 10 s, and sends held actions when the page closes.
- `GET /api/desk/daily?from&to`: for each day, what to make, the load, whether the day is closed, and the money (orders, value, paid, owed); and the money of the last 30 days.
- `GET /api/desk/quotes`: her latest 100 quote requests, with the buyer's contact and the translations.
- `GET /api/desk/board-posts`: the open board posts of her city, with her own answer, when her bulk section is on. `POST /api/desk/board-posts/:id/interest` (idempotency key): **I can do this**, with an optional note. A second answer changes the note.
- `GET /api/desk/events`: Server-Sent Events: `order_created`, `order_changed`, `order_removed` and `quote_created`, with a heartbeat every 20 s.
- `GET /api/desk/session`: whether this browser holds a desk session, with no 401 when it does not.
- `POST /api/desk/orders/:id/day-check`: checks an edit against the day before it is saved, so that the desk can warn first.
- `DELETE /api/desk/orders/:id`: the undo of a fresh, untouched desk order, within the undo window. The experiment's conversion event waits for the end of that window.
- `GET /api/ops/state`, `GET /api/ops/flags`, `GET /api/ops/sarvam`, `POST /api/ops/trigger`, `POST /api/ops/approve`, `POST /api/ops/reject`, `POST /api/ops/reset`: the developer console of `/ops` (who may use it: "Codes and sessions"). With flags from Flagsmith, trigger gives 403: add the bad override in Flagsmith instead.

Buyer:

- `GET /api/cities`: the cities of the marketplace stores, once each, for the city picker of the buyer pages: `key`, a label in each of the six app languages, and the `centre` (`null` for a city that is not in the table of `shared/cities.ts`).
- `GET /api/search`: `q` (100 characters at most), `need_by`, `veg`, `category`, `sort`, `lat` and `lng` together, and `city` (see "Search").
- `POST /api/search/speech`: one WAV (raw `audio/wav`, from 0.1 s to 30 s, 1 MB at most) gives its transcript and language, for a voice search. With `ops_voice` off it gives 409 `voice_off`.
- `GET /api/stores/:slug`, `GET /api/stores/:slug/qr.svg` (published stores only).
- `GET /api/photos/:name`: a photo, with the media type of its kind, `X-Content-Type-Options: nosniff` and a cache of one year.
- `POST /api/cart/read/parts?store=<slug>`, then `POST /api/cart/read`: a cart from voice parts, in the same two steps as the desk.
- `POST /api/days`: the days that fit a cart.
- `POST /api/orders`: create an order (the number proof, an idempotency key, `via`).
- `GET /api/orders/:token`.
- Checkout refuses a day before today or after the 21-day window (`day_past`, `day_too_far`).
- `POST /api/payments/:token/start` (idempotency key), then `POST /api/payments/mock/:token/pay` or `/fail` (see "Payments").
- `GET /api/bulk/stores`: the stores of the **Bulk and corporate** tab, and the link token of the demo board post as an example. With `?lang=`, each bulk item has `name_script`. With `?city=`, the stores of that city only.
- `POST /api/board-posts/email/start`, `POST /api/board-posts/email/check`: the work email code, then its proof.
- `POST /api/board-posts` (the number proof, the email proof and an idempotency key): the answer has the token of the company's link. `GET /api/board-posts/:token`; `PATCH /api/board-posts/:token` with one `action`: `edit`, `close` or `reopen`. The need-by day is at most 180 days ahead, and a post closes after it. The shared demo post refuses `PATCH` (403): visitors can read it and contact its stores, but not change it.
- Board posts, the city filters and the city picker match a city across scripts with the city table in `shared/cities.ts` (17 cities, each with a label in the six app languages, other names and spellings, and a centre). Other cities match by the same words.
- `POST /api/quotes` (the number proof and an idempotency key): a quote request for a bulk cart, a catering plan or a board post answer. The answer has her WhatsApp number (product rule 10). A board post answer needs the token of the post and a store that answered it.
- `GET /api/catering/search`: city, date, food type, guests and the highest price. `POST /api/catering/check`: the plate rules of one plan, and her other packages that allow it.
- `GET /api/privacy`: the contact for privacy complaints (see "Configuration").

## Reading pipeline

One pipeline reads orders on the desk, carts on the store page and items in setup. Only desk readings (`POST /api/desk/read`) are in the experiment.

1. The browser records or opens the audio. It refuses a source file of more than 5 minutes. It decodes the audio with the Web Audio API into a 16 kHz `OfflineAudioContext` (the browser resamples in native code), and cuts it into the fewest parts of 29 s or less, of even length, each cut at the quietest 20 ms. A WAV that is already 16 kHz mono 16-bit and 29 s or less goes byte for byte, so a recorded fixture keeps its SHA-256. It sends each part as a WAV file (`audio/wav`), with an idempotency key. If the browser cannot decode a file (for example Ogg/Opus on iOS before 18.4), the page shows the manual path.
2. Environment flags: the client calls `getEnvironmentFlags()` at most once each 60 s, when a request needs it, and keeps all environment flags in memory. Local evaluation stays off.
3. Speech to text for each part: `saaras:v4`, mode `codemix`, with no `language_code`, so that the answer has the detected language and its probability. `keyterms`: the item names of the store, in their script and in Latin, up to 50. The server joins the transcripts. The language is the language of the longest part by audio length (a tie goes to the longer transcript). A voice order needs no language identification.
4. A text order skips steps 1 to 3. Its language comes from the `language` field, or from Sarvam language identification.
   An item reading in setup sends no `keyterms`, and a typed item gets no language identification. Steps 5, 6, 7 and 11 do not apply. Its flags are the environment flags of step 2: `ops_suggestions` (`off` reads nothing), and `cfg_sarvam`, or the safe setting when `ops_reading` is `safe`.
5. Flags for the order: `getIdentityFlags("order:<uuid>", { store, source, language, is_demo })`, one remote request. The trait `language` is the code from Sarvam, for example `kn-IN`. The result gives `ops_reading`, `cfg_sarvam` (with the overrides of the language segment), `exp_reading_path` and `cfg_demo_trace`. The in-memory overrides of `/ops` apply on top.
6. Exposure: for a desk reading on the `ai` path with a `source` other than `load`, the server records the exposure with `trackExposureEvent` if the order is in the experiment. Cart readings and `load` readings use the `native` variant and record nothing. Item readings record nothing.
7. For `translate_first`: `mayura:v1` changes the transcript to English (source `auto`, mode `code-mixed`). A request takes 1,000 characters at most, so the server splits longer text at sentence ends. An `en-IN` transcript needs no translation.
8. Reading: `sarvam-105b` with `response_format` `json_schema` and `"strict": true`. The prompt has the menu of the store: item names and their Latin forms. The server always sends `reasoning_effort` and `max_tokens` from `cfg_sarvam`. `null` turns reasoning off.
9. The server validates the answer with zod. An answer with `finish_reason: "length"` or an empty `content` is `invalid`. The server matches each item to the menu, changes each amount to the fewest packs, marks near matches, and checks the daily limit. The pack search stops after 15,000 steps, then takes the largest packs first, marked near if they miss the amount, so that no request can block the server.
   An item reading has its own strict schema and prompt, with no menu: one item with its name as she says it, its Latin name, its category, its food mark, her price for a kg or a piece, and the allergens that she names. A price out of ₹1 to ₹1,00,000 or a name over 60 characters is `invalid`. The packs come from the price by the pack rule of `docs/demo-data.md`: 250 g, 500 g and 1 kg, each rounded up to the next ₹5, or 1, 6 and 12 pieces. The seller checks each value (`docs/design.md`, "Rules for the look" 5) before the item joins her draft. `reading_results_total` counts item readings with the variant `native` (`none` on the manual path).
10. The answer has the transcript, the language, the draft and the flag trace. The trace names the segment from the `language` trait, because remote answers do not name segments.
11. When the seller saves a desk draft with no change, the server calls `trackEvent("order_saved_unedited", { identifier: "order:<uuid>" })` at the end of the undo window, unless she takes the order back.

Paths of `ops_reading`:

| Path | Behaviour |
|---|---|
| `ai` | The normal path above |
| `safe` | A fixed, known-good setting: native reading, `reasoning_effort: null`, 1,024 maximum tokens |
| `manual` | No reading. The page shows the transcript, and the person fills in the draft |

Timeouts:

| Call | Timeout |
|---|---|
| Speech to text, for each part | 20 s |
| Reading | 20 s |
| Translation | 10 s |
| Transliteration | 5 s |
| Language identification | 5 s |

Retries follow `AGENTS.md` ("Backend") and the error table in `docs/sarvam.md` ("Errors"). After a failure, the page shows the manual path.

## Flags

| Flag | Kind | Value | Default in code | Who changes it |
|---|---|---|---|---|
| `ops_voice` | ops | On or off. Off: no mic buttons; list, paste and type only | on | Team |
| `ops_reading` | ops | `ai`, `safe` or `manual`, with an override for each language segment | `ai` | Team, NudgeBee |
| `ops_suggestions` | ops | `ai` or `off`. Off: no item reading in setup (voice or text), so no category pick either; the seller fills in the item form | `ai` | Team |
| `ops_search` | ops | `ai` or `plain`. Plain: a substring match on the original names, with no transliteration | `ai` | Team |
| `ops_transliteration` | ops | `ai` or `off`. Off: item names show in their original script | `ai` | Team |
| `ops_translation` | ops | `ai` or `off`. Off: the original text only | `ai` | Team |
| `ops_review_check` | ops | `ai` or `wordlist`. It is for the review check, which is on the roadmap, so no feature reads it in this build | `ai` | Team |
| `exp_reading_path` | experiment | `native` (control) or `translate_first`, 50/50 | `native` | Team |
| `cfg_sarvam` | remote config | JSON: speech model and mode, reading model, reasoning effort (`low`, `medium`, `high` or `null`), maximum tokens (1 to 4,096), translation model. Overrides for each language segment | the safe setting | Team |
| `cfg_demo_trace` | remote config | On or off. On: a one-line trace on each desk reading (language, path, variant, time) | off | Team |

- The setup makes the `ops_reading` override for `lang_kn` (value `ai`) in the live environment, so that the NudgeBee rollback only changes a value. A global `ops_reading` switch must change the environment default and this override.
- Segments: `lang_kn`, `lang_hi` and `lang_en`. Each rule is "`language` equals `kn-IN`" (or `hi-IN`, `en-IN`). Rules are case-sensitive exact matches. The segment `demo` is "`is_demo` equals `true`". Its override turns `cfg_demo_trace` on.
- With no `language` trait, the default flag values apply.
- One server client, with the server-side environment key and `enableEvents` on. Flags for an order use remote evaluation, because experiments need it. The server decides once for each request and passes the decision down.
- Client settings: `requestTimeoutSeconds: 2` and `retries: 0`. On any error, the values of the `defaultFlagHandler` apply. The SDK takes no `AbortSignal`, so the client gets a custom `fetch` with a timeout and the signal of the request. On SIGTERM, the server calls `await flagsmith.close(5000)`, so that no buffered event is lost.
- `cfg_sarvam` arrives as a string. The server parses it and validates it with a zod schema. It stays under 20,000 bytes.
- How each kind is read: `ops_voice` and `cfg_demo_trace` use the on or off state. The other `ops_` flags use the value, so a value-only override (for example the NudgeBee rollback) always takes effect. `exp_reading_path` uses the value when the flag is on; off gives `native` and no experiment. An invalid or missing value gives the default in code, and the log names the flag, never the value.
- A failed refresh of the environment flags keeps the last good values. `environment()` and `forOrder()` never fail: an error or a timeout gives the defaults.
- Experiment: question "Does native reading need fewer corrections than translate-first reading?" Metric: occurrences of `order_saved_unedited`. Identity: the order. The control has the key `control`, and the variation `translate_first` has the key `translate_first`. Rollout 100%, split 50/50. The variation weight on the flag is 0, so no reading uses `translate_first` outside the experiment. Starting the experiment sets the split. `in_experiment` comes from the `getIdentityFlags` answer (`metadata.experiment.in_experiment`).

Non-AI fallback for each AI feature:

| AI feature | Fallback |
|---|---|
| Speech to text | The list, paste or type (`ops_voice` off) |
| Order reading | The manual draft with the transcript (`ops_reading` = `manual`) |
| Item reading and its category pick | The item form (`ops_suggestions` off) |
| Language identification | The default flag values (no `language` trait) |
| Search across scripts | A substring match (`ops_search` = `plain`) |
| Item names in the buyer's script | The original script (`ops_transliteration` off) |
| Translation | The original text (`ops_translation` off) |

## Experiment run

1. Set up `exp_reading_path` as "Flags" says (`npm run flagsmith-setup`), with the warehouse on in the live environment (`README.md`, "Plug in the services"). The server needs the server-side key of that environment and live Sarvam calls. Then start the experiment in Flagsmith.
2. Place voice orders with **Add order** on the desk of `test-kitchen`, from the voice lines in `docs/demo-data.md`, in Kannada, Hindi and English, until each variation has about 50 orders. Correct a draft only where it is wrong. The **Flagsmith** section of `/ops` counts the exposures and conversions since the server started.
3. Place all orders within 10 days, because Flagsmith rejects older events.
4. When each variation has 50 orders and 5 conversions, select **Refresh results** in Flagsmith.

## Metrics

- `http_requests_total{route,method,status}` and `http_request_duration_seconds{route}`. `route` is the route pattern, for example `/o/:token`, never the raw path.
- `sarvam_requests_total{api,model,language,outcome}` and `sarvam_request_duration_seconds{api,model,language}`
- `sarvam_billed_units_total{api,unit}`. `unit` is `audio_seconds`, `characters`, `input_tokens`, `cached_input_tokens` or `output_tokens`.
- `reading_results_total{language,variant,path,outcome}`
- `orders_created_total{source,language,variant,edited}`
- `quote_requests_total{kind}`
- `push_sent_total{outcome}` is in the registry for web push, which is on the roadmap. Nothing counts it in this build.
- `/metrics` also has the default Node.js process metrics of `prom-client`.
- Outcome values: `ok`, `invalid`, `rate_limited` (429), `no_credit` (402, or 429 with `seat_budget_exhausted_error`), `error`, `timeout`.
- The `language` label is a Sarvam speech code, `unknown` or `other`, so no client can add series. A request's `language` field accepts only the 23 Sarvam speech codes.
- Billed units: the server counts audio seconds for speech to text and characters for translation, transliteration and language identification, because those answers have no usage field. For chat, it reads `usage` from the answer. Only 2xx answers in live mode count.

## Alerts

PrometheusRules in `deploy/prometheus-rules.yaml`. The stack from the NudgeBee script picks them up with no `release` label (see `docs/nudgebee.md`). Only a critical alert starts a NudgeBee AI investigation, so only the incident alert is critical.

| Alert | Condition | Severity |
|---|---|---|
| `ReadingInvalidRateHigh` | For one language, invalid readings are more than 30% of readings for 2 minutes, with 5 readings or more. The alert carries the `language` label | critical |
| `SarvamErrorRateHigh` | For one API, errors, rate limits and timeouts are more than 20% of calls for 2 minutes | warning |
| `SarvamNoCredit` | One or more `no_credit` outcomes in the last 10 minutes | warning |
| `SarvamLatencyHigh` | For one API, p95 latency is more than 8 s for 5 minutes | warning |
| `Http5xxHigh` | 5xx answers are more than 5% for 5 minutes. Health checks and scrapes are left out | warning |

Turn off the default rules that always fire on k3s (see `docs/nudgebee.md`, "Agent install").

## NudgeBee workflows

The workflow files are in `nudgebee/` at the repository root. After each change, run `nbctl workflow validate` and `nbctl workflow apply` (`README.md`, "Plug in the services"). The rules for publishing, approvals and Dry Run are in `docs/nudgebee.md`. Do not use Dry Run on the rollback workflow.

1. Flag-change events (`flag-change-events.yaml`):
   - The Flagsmith environment webhook calls the Automation Webhook URL of the workflow.
   - Filter: `{{ webhook_payload.event_type == "FLAG_UPDATED" }}`.
   - `events.store` writes an event with the title "Flag changed: <feature.name>", a `description` with the old and new values, `finding_type`, `status`, `subject_namespace` and `subject_name` set to our app, a unique `finding_id` for each change, and `trigger_ai_analysis: false`.
   - If NuBi does not use these events, add a task that writes each change to the ConfigMap `flag-changes` in our namespace (`k8s.cli`), because NuBi reads ConfigMap changes.
2. Rollback (`rollback-lang-kn.yaml`). The workflow handles `lang_kn` only.
   - Trigger: an event, with `"on": "investigation.completed"` and the filter `{{ event.labels.alertname == "ReadingInvalidRateHigh" and event.labels.language == "kn-IN" }}`. Check the label names in one real run first.
   - `core.approval`, mode `in_app`, Task Timeout 30 minutes. The workflow timeout is 45 minutes.
   - An HTTP `PATCH` to the Flagsmith management API, with `if: "{{ Tasks['approval'].output.status == 'approve' }}"`, `auth_type: api_key`, a `timeout` of 10 s, and no retries.
   - `events.add_evidence` adds the result to the event of the alert.

The rollback request uses the environment key and two numeric IDs, which `npm run flagsmith-setup` prints. The workflow keeps them as Configs (`flagsmith_environment_key`, `flagsmith_ops_reading_feature_id`, `flagsmith_lang_kn_segment_id`). The header value comes from a NudgeBee Secret that holds `Api-Key <organisation_api_key>`:

```text
PATCH https://api.flagsmith.com/api/__future__/environments/{environment_key}/features/{ops_reading_feature_id}/
Authorization: Api-Key {organisation_api_key}
{"segment_overrides": [{"segment": {"id": <lang_kn_segment_id>}, "value": {"type": "string", "value": "safe"}}]}
```

The change fires `FLAG_UPDATED` again, so the rollback also makes a flag-change event. The workflow changes only an `ops_` flag. Remove the bad `cfg_sarvam` override by hand.

The demo incident: a `cfg_sarvam` override for `lang_kn` turns reasoning on with 256 maximum tokens. Kannada answers come back cut off (`finish_reason: "length"`), `ReadingInvalidRateHigh` fires for `kn-IN`, NudgeBee investigates, and the rollback workflow runs. The steps are in "Incident runbook".

## Incident runbook

For a NudgeBee tenant on the k3s path, with the two workflows loaded:

1. Start the load script (`npm run load`): text orders for `test-kitchen` in Kannada, Hindi and English, with a known `language` and the source `load`, about 15 a minute.
2. In Flagsmith, add an override of `cfg_sarvam` for `lang_kn`: reasoning on, 256 maximum tokens.
3. Wait for the `ReadingInvalidRateHigh` alert (2 minutes after the readings start to fail) and the NudgeBee investigation.
4. Open the waiting run in the NudgeBee app and approve the fix.
5. Check that Kannada readings recover and that Hindi and English did not change.
6. Remove the bad `cfg_sarvam` override by hand. Set the `ops_reading` override for `lang_kn` back to `ai`.

This build runs the incident as the simulated **NudgeBee** section of `/ops` (see "Prototype parts"). **Set the bad cfg_sarvam for lang_kn** adds the bad override in memory (with flags from Flagsmith, add it in Flagsmith instead). The console shows the alert condition from our own metrics. **Approve** makes the rollback change, and **Remove both overrides** removes the in-memory overrides.

## Codes and sessions

- A code has 6 digits and expires after 5 minutes. A number or an email address gets 5 tries for each code and 3 codes in 15 minutes. The server keeps only a hash.
- Seller session: a signed, HTTP-only cookie (`__Host-desk_session`: Secure, `SameSite=Lax`, `Path=/`, no `Domain`) on her phone for 90 days. On a new phone, she verifies again. The `__Host-` prefix matters, because sslip.io is not on the Public Suffix List, so any other `*.sslip.io` host is same-site with ours. Unsafe desk requests and the code checks get 403 `forbidden` unless `Sec-Fetch-Site` is `same-origin` or `none`. `same-site` is refused too, because other `*.sslip.io` hosts are same-site. Without that header, an `Origin` other than the origin of `PUBLIC_URL` is refused, and a request with neither (a script) passes.
- A verified buyer code gives a proof that lasts 15 minutes and works for one order, quote request or board post. It is used up in the same transaction as the record.
- Each code has a purpose. A check opens only what its purpose gives, and a proof of one purpose never works for another:

| Purpose | Target | The check gives |
|---|---|---|
| `order` | A WhatsApp number | The buyer proof |
| `desk` | The number of a seller with a store, but not the store of the demo desk | The seller session |
| `publish` | Any number but that of the demo desk's seller | Her seller record on first use, and the seller session. The answer names her store, or `null` before she makes one; she stays private until she publishes |
| `work_email` | A work email address, in lower case, not at a personal mail domain | A proof of 15 minutes for one board post |

- `POST /api/verify/start` and `/check` take a number. The work email has its own routes (`/api/board-posts/email/start` and `/check`), with the same code rules. The 3 codes in 15 minutes count every purpose of one target.
- Two checks guard the seller routes. `sellerAuth` needs only the seller session, for setup, because right after her publish code she has no store yet. The demo token opens nothing there. `deskAuth` needs the session and her store, or the demo token, for each other `/api/desk/` route. Both refuse other sites in the same way.
- The `/api/ops/` routes need the demo token. A seller's own session gets 403 `forbidden`: the incident changes the readings of every store, approve changes a Flagsmith flag, and anyone can make a seller account in this build.
- The demo desk page sends the token in the `X-Demo-Token` header. Its Server-Sent Events request sends `?demo=`, because `EventSource` cannot set headers.
- In this build the code shows on the screen, so anyone who knows a seller's number can open her desk. This is acceptable only while every seller is made up.
- The store of the demo desk (`shobhas-kitchen`) opens only by the demo token. The numbers of the demo sellers are public in `fixtures/demo.json`, so `POST /api/verify/start` and `/check` give 403 `use_demo_link` for a `desk` or `publish` code to her number. The other demo stores and test-kitchen still sign in by code.
- Buyer: a code for each order, quote request or board post.

## Messages

- Templates in English, Hindi, Kannada, Tamil, Telugu and Marathi: order placed, order ready, order changed, order cancelled (with the reason). Each one ends with the link to the order, the link to message the store, and the line that tells how to stop the messages ("reply STOP").
- Checkout sends "order placed" (an order that waits for its payment gets it at **Pay**). An edit sends "order changed", and a cancel sends "order cancelled".
- READY sends one message, 10 s after the stamp and only if the order is still READY then, so an undo takes it back. MAKING, the final stamp and PAID send none. Desk and load orders never get automatic messages.
- The server keeps `buyer_language` from checkout and selects the template in that language.
- The simulated sender writes each message to `messages`.
- `wa.me` links: `https://wa.me/<number>?text=<url-encoded text>`. The number is the full international number with no `+`, spaces or dashes. `https://wa.me/?text=<text>` (no number) lets the user pick a contact.
- Reminders, review requests and board post messages to stores are on the roadmap (`README.md`, "Roadmap").

## Payments

- One provider: `mock`, the prototype screen. Razorpay test mode is on the roadmap (`README.md`, "Roadmap"). The `provider` column already allows `razorpay`.
- Mock: the order page links to `/pay/:token`. **Pay** marks the order PAID. **Fail** leaves it unpaid.
- Required advance: `POST /api/orders` makes the order with the status `awaiting_payment`. It holds its space on the day for 15 minutes. **Pay** changes the status to `new`. With no payment after 15 minutes, the status becomes `expired`, and the space goes back.
- Only a store that accepts online payments takes them. For another store, the payment routes give 403.
- `POST /api/payments/:token/start` reuses the open payment of the order, with the order total of now, and answers the address of the payment screen. A new try after **Fail** starts a new payment. A cancelled or expired order gives 409 `order_closed`.
- A paid order answers as paid. So does an order with a paid payment that was not refunded, so that no buyer pays twice.
- An order that waits for its payment gets the "order placed" message at **Pay**, not at checkout.
- On the desk, marking an order paid by hand works like **Pay**: an order that waits for its payment becomes `new` and keeps its space, and a buyer who agreed to messages gets the "order placed" message. An order with an online payment that was not refunded cannot be marked unpaid: the desk gets 409 `use_refund`. **Refund** gives the money back.
- **Refund** on the desk (`POST /api/desk/orders/:id/refund`) gives back the full amount of the paid online payment, once, and marks the order unpaid. An order that she marked paid by hand gets a cash refund of its total. The order keeps the refund (`refund_amount`, `refund_online`). A repeat answers the same order. An order that is not paid gives 409.
- The expiry sweep runs every 30 s. Checkout, `GET /api/orders/:token` and the payment routes also run it before they read an order, so no page shows an old status, and checkout counts no expired hold. The order page gives `pay_by`, the end of the hold.

## Search

- An FTS5 table with the trigram tokenizer (`search_index`) covers the normalized Latin form of each item name (`name_latin`, else `name`) and each store name.
- SQL cannot run the normalization, so triggers only queue each changed name in `search_stale`, and the server indexes the queue before each search. The first search after a start indexes every row again, so a changed rule reaches the old rows.
- At save, an item name in an Indian script with no Latin form gets one from Sarvam transliteration (`target_language_code: en-IN`). The script gives the source language, as for a query. A Latin form that she types stays. The translation cache keeps each answer. With no answer in 2 s, a placeholder answer or `ops_transliteration` off, the item keeps only its name, and the save goes on.
- The server normalizes each Latin form and each query: lower case, no accents, only letters, digits and vowel signs (so no spaces), then one vowel for a doubled vowel: `ee` becomes `i`, `oo` becomes `u`, and a doubled `a`, `i` or `u` becomes one. A test checks that "kaju katli", "ಕಾಜು ಕಟ್ಲಿ" and "काजू कतली" give the same results.
- The server transliterates a query in an Indian script to Latin first. The script gives the source language: Kannada `kn-IN`, Devanagari `hi-IN` (Marathi too), Tamil `ta-IN`, Telugu `te-IN`. If the transliteration fails, the query matches the original names as text.
- A voice query goes through speech to text first (`POST /api/search/speech`), with the dish names of the marketplace as `keyterms`. The page shows the words it heard and searches them.
- The trigram tokenizer matches nothing for a query of less than 3 characters. Such a query uses a prefix match: the start of a word of the name.
- Results: the stores in the marketplace (`in_marketplace`, with a verified seller and an FSSAI number), in `city` when the buyer gives one (the page sends the city of its picker: the address `?city=`, else the last choice in localStorage, else Bengaluru), with the veg and category filters. A cook shows when one of her dishes that pass the filters matches the words, or her store name matches. Her card shows 3 of those dishes at most: the matching ones first (all of them when her store name matches), then her others; in each group, the ones she still has first and her special ones first among them. Each dish has her cheapest pack (`pack`: label, grams, pieces, price). The card also has the number of her other dishes, the kind of her shop (`categories`: her two biggest menu categories, the biggest first; the card names the first), her `rating` and her next day with space.
- **Need it by**: the server uses the capacity functions to find, for each store, a day with space on or before the date. With no cook in time, the answer has the cooks with the nearest later days and `need_by_met: false`. A day before today or after the 21-day window gives `day_past` or `day_too_far`.
- Sort by distance or by rating; with no `sort`, by distance when the buyer gives her location, else by rating. Distance starts at her location, else at the centre of `city` (the answer says `distance_from`: `buyer`, `centre` or `null`, and the page says that it is the centre). Best rated orders by `rating_average`, highest first. Stores with no rating (`rating_average` NULL or `rating_count` 0, so the answer has `rating: null` and the card says "New") come after the rated ones; when the results have one, the page says so under Sort. In both sorts, the next day with space breaks a tie. A cook who takes no orders now comes last in both sorts.
- The distance starts at the middle of the 0.01° grid cell (about 1 km) of her pin, not at the pin, and it is in whole kilometres, at least 1. From the exact pin, searches from chosen places could find where the rounded distance changes, and so find her home.
- `rating` is `{ average, count }`, the average to one decimal, or null. In this build the ratings are made-up demo data (migration 012, `docs/demo-data.md`); reviews are on the roadmap (`README.md`, "Roadmap").

## Capacity

Pure functions in `capacity/`:

- Load of a day: the sum of all orders on that day, in the unit of her limit. For `orders`, each order is 1. For `kg`, each pack adds its grams. For `pieces`, each pack adds its pieces. Orders that are `awaiting_payment` add load. Orders that are `cancelled` or `expired` add none.
- Fits: the store takes orders (it is not paused, and normal orders are on), the load plus the cart is not more than the limit, the day is a working day, the day is not closed, and the day is not after the last day for orders. A store with no daily limit fits any cart on an open working day. A day at its limit is full, even for an empty cart. With an `orders` limit, each cart counts as 1.
- Next free day: the first day in a range where the cart fits. The range includes its first day, so "after a date" starts the day after it.
- The store page and the day picker offer 21 days from today, the same as the window in which a festival is near.

## Catering rules

Pure functions in `catering/`:

- `checkPlan(package, selection)`: each category over its maximum or under its minimum, and whether the total is over the maximum.
- `fittingPackages(packages, selection)`: the packages of the store whose dishes and maximums allow the selection.
- A change of package keeps the dishes that the new package has and runs `checkPlan` again. The plan builder names each category over its maximum (and the total), offers the `fittingPackages`, and keeps Contact seller off until the plan fits.
- Service style price (`planEstimate` in `shared/catering.ts`): delivery is the package price. With serving staff and with live counters each add the package's own amount (`style_extras`) to each plate or guest. The estimate is (price + extra) × guests, or "Price on request" when the package has no price. The request stores the extra (`service_extra`), and the summary and the WhatsApp text name it.
- The buyer chooses no food type for a plan: each dish shows its mark. The Catering tab keeps its food type filter.
- Food type match (the filter): veg, if each dish of the package is veg. Jain, if the package has a Jain dish and each category with a minimum has enough Jain dishes to meet it. Non-veg, if at least one dish is non-veg (egg counts as non-veg). Mixed matches each package.

## Festivals

- `shared/festivals.ts` lists each festival of the season: name, date and common items.
- A festival is near when its date is in the 21 days of the day picker (`nearFestivals`). The homepage takes the window of its **Need it by** picker from the same constant. Festive suggestions are on the roadmap (`docs/concept.md`, "Festive touches"), so no page shows the list in this build.

## Languages

- The app text is in English, Hindi, Kannada, Tamil, Telugu and Marathi, as one JSON file for each language (`src/text/`), with one namespace for each page. A missing string falls back to English. English ships with each page; another language loads on first use.
- The page HTML names its strings with `data-text`, `data-text-label` and `data-text-placeholder`. `?lang=` overrides the language, for the demo links. A test fails when a key is missing from English or a translation has keys or parameters that English lacks.
- Reading segments: Kannada, Hindi and English. Other languages use the default flag values.
- Item names in the buyer's script come from Sarvam transliteration, from the Latin form. The `translations` table caches each result.
- One rule names a dish (`shared/item-names.ts`, `shownName`): on an English page, the English name alone (`name_latin`, else `name`); in another language, the name in the script of that language first (the seller's own name when it is in that script, else `name_script`, the Sarvam transliteration), then the English name. It returns the two parts, so a page shows them side by side ("ಮೈಸೂರು ಪಾಕ್ · Mysore pak") or on two lines, and a screen reader hears a pause between them. The store page, the cart, checkout, the order page, the WhatsApp messages, the desk, the homepage cards and the bulk and catering pages all use it. Store names and areas show as the seller typed them, in English.

## Security and privacy

- Rate limits for each client address: codes 60 an hour (many people on one network can share an address; the limits for each number stay, see "Codes and sessions"), readings 20 a minute, searches 60 a minute, uploads 20 a minute. Codes: the code requests for a number or a work email. Readings: desk, cart and item readings. Searches: search, the bulk stores, the catering search and the link suggestion. Uploads: voice parts, the voice search and the cover photo.
- The client address is the last address in `X-Forwarded-For` (the address that the nearest proxy adds), else the address of the connection.
- Limits: a WAV part is 30 s and 1 MB at most; a photo is 2 MB at most after the browser shrinks it; a menu is 256 KB at most; a typed order is 5,000 characters at most.
- `/metrics` answers 404 to a request that came through a proxy (`X-Forwarded-For` or `Forwarded`), so the public address does not show it. On k3s, the Ingress also refuses it.
- Logs never hold phone numbers or addresses. The request log names the route pattern, not the raw path.
- `stores.address` goes only to the order page and the messages of a pickup order. Its map link is built from the address. `stores.lat` and `stores.lng` never leave the server, because an exact pin shows her home.
- An idempotency key is bound to its route, its caller (where the route knows one) and a hash of its query and body. The same key with another body gets 422 `idempotency_key_reused`, so a reused key never replays another person's answer. SQLite keeps the keys for 24 hours. The reading routes keep their keys in memory with the parts, for 15 minutes.
- Delete for sellers and buyers is on the roadmap (`docs/concept.md`, "Product rules" 13).

## Demo mode

- Demo stores have `is_demo` and show the "Demo" badge.
- The demo desk opens at `/desk?demo=<token>`, with no code. The page keeps the token for the tab (`sessionStorage`) and takes it out of the address.
- The seed comes from `fixtures/demo.json`, made from `docs/demo-data.md`. The server refreshes the demo seed at start and each day at 00:00 IST, with days relative to that day. The refresh restores the settings and menus of the demo stores and deletes all their orders and quote requests, including test orders from visitors. `test-kitchen` is made once and never reset.
- The experiment and the load script use the store `test-kitchen` (see `docs/demo-data.md`), so the demo store keeps its seed days.

## Configuration

Each credential, endpoint and mode comes from an environment variable. One zod schema in `server/config.ts` checks them at start, and names each missing or wrong variable. `.env.example` lists each variable, where to get it and what happens without it (`README.md`, "Plug in the services").

| Variable | Use | Without it |
|---|---|---|
| `SARVAM_MODE` | `live` or `recorded` | `recorded`. `live` with no `SARVAM_API_KEY` stops the server at start |
| `SARVAM_API_KEY` | Sarvam calls | Recorded mode only |
| `SARVAM_BASE_URL` | Sarvam API base | `https://api.sarvam.ai` |
| `FLAGSMITH_ENVIRONMENT_KEY` | The server-side key of one environment | The flag defaults in code, and no experiment |
| `FLAGSMITH_API_URL` | The Flagsmith API base, for the SDK | The SDK default |
| `FLAGSMITH_ORG_API_KEY` | `npm run flagsmith-setup`, `npm run doctor`, and the rollback that **Approve** on `/ops` sends to Flagsmith | The setup script stops with a message; `/ops` uses an in-memory override |
| `FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY`, `FLAGSMITH_OPS_READING_FEATURE_ID`, `FLAGSMITH_LANG_KN_SEGMENT_ID` | The rollback PATCH from `/ops` (the values that `npm run flagsmith-setup` prints). The rollback also needs `FLAGSMITH_ENVIRONMENT_KEY` and `FLAGSMITH_ORG_API_KEY` | `/ops` uses an in-memory override |
| `FLAGSMITH_ADMIN_API_URL` | The management API base, for the setup script, the doctor and the `/ops` rollback | `https://api.flagsmith.com/api/v1/` |
| `FLAGSMITH_PROJECT_ID`, `FLAGSMITH_LIVE_ENVIRONMENT` | `scripts/flagsmith-setup.ts`: the project, and the environment that gets the experiment, the webhook and the rollback values | No project: the script lists the projects and stops. No environment: Production |
| `NUDGEBEE_FLAG_WEBHOOK_URL` | `scripts/flagsmith-setup.ts`: the Automation Webhook URL of the flag-change workflow | No webhook. Set it by hand |
| `NUDGEBEE_API_TOKEN` | `nbctl`, for a NudgeBee tenant. The app does not read it | No `nbctl` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push, which is on the roadmap. The server checks them at start (all three or none, and one P-256 pair), but nothing sends a push. `npm run vapid` makes them | Nothing changes in this build |
| `SESSION_SECRET` | Signs the desk cookie, and keys the hashes of codes and sessions (32 characters or more) | The server does not start |
| `DEMO_DESK_TOKEN` | The demo desk link and `/ops` (16 or more letters, digits, `-` or `_`) | No demo desk and no developer console |
| `PUBLIC_URL` | The live address, for links in messages and QR codes, and the origin check of unsafe desk requests | `http://localhost` and the port |
| `PRIVACY_CONTACT` | The contact for complaints on `/privacy` (`GET /api/privacy`) | The page says to write to the store on WhatsApp |
| `DATA_DIR` | SQLite (`app.db`) and photos | `./data` (`/data` in the image) |
| `PORT`, `HOST` | Where the server listens | `8080` and `0.0.0.0` |

- `npm run setup` makes `.env` from `.env.example`, with a new `SESSION_SECRET` and `DEMO_DESK_TOKEN`. When it makes the file, it also sets `HOST=127.0.0.1` and the local `PUBLIC_URL`. It never overwrites a value that is there.
- To swap a credential, change `.env` (local), the variables of the Railway service, or the Actions secret (k3s), then restart. On k3s, run the CI workflow on `main` again, which restarts the pod. No code changes.
- `npm run doctor` makes one cheap call to each service with the current settings. It prints OK, or the failure and the next step. Run it after each swap.
- Sarvam sits behind `server/sarvam/` and the Flagsmith SDK behind `server/flags/`, so a changed API changes one module. The `/ops` rollback PATCH is in `server/ops/rollback.ts`. The NudgeBee side lives in files (`nudgebee/`, and the PrometheusRules in `deploy/`). `nbctl workflow apply` loads the workflows into any tenant.
- A new Flagsmith project: `scripts/flagsmith-setup.ts` makes the flags, segments, metric and experiment from "Flags", the `lang_kn` override and the webhook.

## Recorded mode

- `SARVAM_MODE=recorded` replays saved Sarvam answers and shows the "Recorded" badge.
- The saved answers are in `fixtures/sarvam/`, one file for each API: `speech-to-text.json`, `chat.json`, `translate.json`, `transliterate.json` and `language-id.json`. A saved answer is found by the SHA-256 of the WAV part or the text, with the API and the model. An answer saved with `when` (exact settings, for example the incident's reasoning and 256 tokens) wins for those settings.
- Each saved answer in the repository is a hand-written placeholder in the same schema, marked `"placeholder": true`. Each answer of the API says `placeholder`, and the start log and the **Sarvam** section of `/ops` count the placeholders.
- `scripts/record-fixtures.ts` (`npm run record-fixtures`) replaces the placeholders with live answers. Its options are in `README.md` ("Plug in the services"). Real audio goes in `fixtures/sarvam/audio/<line id>.wav`. The `synthetic-*.wav` files there are test audio.
- `voice-lines.json` and `setup-lines.json` hold the words of the voice lines and setup lines of `docs/demo-data.md`. The demo desk offers the voice lines as samples, and the script records both.
- The model answers days as words (`saturday`, `next_tuesday`), and the server turns them into dates, so a saved answer works on any day.
- A voice part, a voice search or an item reading with no saved answer gets 422 `recording_missing`, not a 5xx, so a demo miss does not count as an outage in the 5xx metric and `Http5xxHigh`. An order or cart reading with no saved answer is a 200 on the manual path (outcome `error`). Tests send the fixture WAV files.

## Sarvam credit

- The budget is the free credit of a new account (`docs/sarvam.md`, "Credit and limits").
- Development and tests use recorded mode. Use live calls only where `AGENTS.md` allows them.
- The experiment uses about 150 live voice orders.
- The load script sends text orders with a known `language` and the source `load`, so it uses only the reading step and records no exposures. The rate limits apply to the whole account, and our server allows 20 readings a minute from one address, so the script stays at about 15 requests a minute.

## Deployment

The steps are in `README.md` ("Deploy"). Both paths run the image of the `Dockerfile`.

- Image: `node:22-slim`. The build makes the pages with Vite and installs the production packages; it fails if the `better-sqlite3` binary does not load. The image runs as the user `node`, with `NODE_ENV=production` and `DATA_DIR=/data`, and listens on `PORT` (8080). It runs `node server/main.ts` directly, because npm does not pass SIGTERM on to the server.
- `.dockerignore` lets in only the source folders and the package files, so `.env` and `data/` never reach the image.
- Run one instance on each path, because SQLite has one writer.

Railway, the live app:

- Railway builds the image from the `Dockerfile` and serves it on its HTTPS domain. Set `PUBLIC_URL` to that address.
- The settings are the variables of the Railway service (see "Configuration").
- Mount a volume at `DATA_DIR` (`/data` in the image). Without a volume, the database and the photos reset at each restart, and the demo seed comes back at start.

k3s, the path for a NudgeBee tenant:

- CI builds the image, tags it with the git SHA (`ghcr.io/<owner>/<repo>:<git SHA>`) and pushes it to GitHub Container Registry. The package is public, so k3s needs no pull secret.
- The manifests in `deploy/`:

| File | Contents |
|---|---|
| `00-namespace.yaml` | The namespace `app`. The prefix makes it apply first |
| `cert-issuers.yaml` | The Let's Encrypt issuers `letsencrypt-staging` and `letsencrypt-prod`, with the HTTP-01 challenge through Traefik |
| `configmap.yaml` | The settings that are not secret: `SARVAM_MODE`, `PUBLIC_URL`, `DATA_DIR`, `PORT`, `HOST` |
| `deployment.yaml` | One replica, `strategy: Recreate` (SQLite has one writer), resource requests and limits, liveness `/healthz` and readiness `/readyz`, the volume at `/data`, a non-root user, and 35 s to drain on SIGTERM |
| `pvc.yaml` | The claim `app-data` (5 Gi) for SQLite and photos |
| `service.yaml` | The Service on port 80 |
| `ingress.yaml` | HTTPS for the sslip.io host through cert-manager, a redirect from HTTP, and a second Ingress that answers 403 to `/metrics` |
| `service-monitor.yaml` | Prometheus scrapes `/metrics` from the Service every 15 s |
| `prometheus-rules.yaml` | The alerts (see "Alerts") |
| `traefik-config.yaml` | The k3s Traefik with `externalTrafficPolicy: Local`, so that the client address reaches the per-address rate limits |

- `kubectl apply -f deploy/` applies them. The deploy job first puts the image tag in place of the placeholder in `deployment.yaml`, so that one apply makes one rollout.
- Before the first deploy, put the sslip.io hostname of the static IP in `ingress.yaml` and `configmap.yaml`. The deploy job refuses the placeholder `0-0-0-0.sslip.io`. Use `letsencrypt-staging` until the certificate works, then `letsencrypt-prod`.
- Secrets: the deploy job makes the Secret `app-secrets` from the Actions secrets `SESSION_SECRET`, `SARVAM_API_KEY`, `FLAGSMITH_ENVIRONMENT_KEY`, the three VAPID keys and `DEMO_DESK_TOKEN`, and leaves out an empty one (`kubectl create secret generic app-secrets --from-env-file=/dev/stdin --dry-run=client -o yaml`). It applies the Secret server-side over SSH, so that no copy of the values goes into an annotation.
- GitHub Actions (`.github/workflows/ci.yml`) has three jobs:
  1. Checks: Prettier, `tsc`, `npm test`, then the Playwright tests (`npm run test:e2e`).
  2. Image: build the image, start it in recorded mode, wait for `/readyz`, request `/` and `/healthz`, then push the image. Pull requests stop before the push.
  3. Deploy, on `main` when the Actions variable `DEPLOY_HOST` is set: over SSH, make the Secret, apply `deploy/` (with a restart when the Deployment did not change, so that the pod reads the new Secret), wait for the rollout, then check that `https://<host>/healthz` answers and that `/metrics` answers 403.
- Backups: schedule snapshots of the VM disk. The `local-path` volume has no other copy, and a deleted claim deletes the data.

## Tests

Each module with logic has a test suite next to it: `name.ts` and `name.test.ts`. A change to a module changes its tests in the same commit. `npm test` runs all suites.

- Runner: `node:test`, the test runner of Node 22. Node runs the `.ts` files directly (type stripping), so there is no test package and no build step. Use only erasable TypeScript syntax: no `enum` and no `namespace`.
- Unit tests for each pure function and each module that owns state or logic. Examples: capacity, packs, plate rules, food type matches, search normalization (the three example queries), retries and backoff, idempotency keys, flag defaults, message templates, and each zod schema (one valid and one invalid case for each shape).
- Route tests: each API route through Hono's `app.request()`, with an in-memory SQLite database and `SARVAM_MODE=recorded`.
- Reading tests: the recorded Sarvam answers in `fixtures/`, including the invalid ones (`finish_reason: "length"`, empty content).
- Scripts in `scripts/` have tests too (setup, doctor, Flagsmith setup, the load script, fixture recording, the usage log, the icon sprite and the VAPID keys), with the network replaced. The demo seed has its tests in `server/demo/`.
- Frontend modules: state machines and pure functions run under `node:test`. Code that needs a browser runs in Playwright (`e2e/`, `npm run test:e2e`). The project `modules` loads the browser modules from Vite alone. The project `pages` runs the real server with a fresh database, recorded mode and the flag defaults, at a laptop's width (1440 × 900).
- CI runs `npm test` and both Playwright projects before the image build. Then it starts the new image in recorded mode and checks `/readyz`, `/` and `/healthz` (see "Deployment").
- Recorded audio fixtures are 16 kHz mono 16-bit WAV of 29 s or less, so the browser sends them unchanged.
- The scripts are TypeScript, so one runner covers them. The exception is `scripts/start-local.sh`, which runs before Node.js exists.

## Packages

| Package | Reason |
|---|---|
| `hono`, `@hono/node-server` | The HTTP server |
| `zod` | One schema for each external input |
| `better-sqlite3` | SQLite with FTS5. The SQLite module of Node 22 is still experimental |
| `@flagsmith/nodejs` | Flags and experiment events. `close(timeoutMs)` needs 9.4.0 or later |
| `prom-client` | Metrics |
| `qrcode` | The QR code of the store link, as SVG. Browsers have no QR API |
| `vite`, `typescript`, `prettier`, `@playwright/test`, `@types/*` | Development only |

The versions and licences are in `README.md` ("Credits and licences"). Sarvam calls and the `/ops` rollback PATCH use `fetch`, with no SDK.

`.npmrc` turns off install scripts and enforces the Node.js version in `package.json`. `better-sqlite3` ships ready-made binaries; without the setting, npm compiles it with node-gyp, which needs Python and a C++ compiler.

## Repository layout

```text
src/        pages (one folder for each page) and frontend modules
server/     backend, one folder for each feature
shared/     zod schemas, shared types, the city table, the festival list
fixtures/   recorded Sarvam answers, voice lines, test audio, demo.json
deploy/     Kubernetes manifests and PrometheusRules (the k3s path)
nudgebee/   NudgeBee workflow files
scripts/    setup, doctor, VAPID keys, Flagsmith setup, fixture recording, icon sprite, load script,
            usage log, start-local.sh (the one shell script: it runs before Node.js exists)
e2e/        Playwright tests: browser modules and pages
extra/      design swatches
docs/       context files, and the README screenshots in docs/images/
.github/    the CI workflow
```

At the root: `LICENSE` (MIT), `Dockerfile`, `.env.example`, `package.json`, `tsconfig.json`, `vite.config.ts`, `README.md`, and `AGENTS.md` (the rules; `CLAUDE.md` points to it).
