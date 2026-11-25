---
title: Design
purpose: The design bar, the visual direction, the interaction and copy choices, and the inputs for the design rounds.
read-when: You run a design round in extra/, or you build or style a screen, an icon or a motion.
owns: design bar, visual direction, colour, theme, icons, look rules, interaction and motion, copy style, anti-slop list, design references, round inputs
---

# Design

The tokens, the icons and the exact sounds come from the design rounds (`extra/README.md`). The rounds for style, type and icons are done, and this file records the selection. The sound system is in `docs/sound.md`.

## The bar

Spaceship (https://github.com/chuanqisun/spaceship, MIT) is the quality bar. Copy its method and its craft. Do not copy its look or its sounds. Spaceship is a cockpit for steering text. We make an Indian food counter for a home seller, and the other side of the counter for the people who buy from her.

What makes Spaceship good:

1. Each token has one job, written next to it. Example: "ink-3, .40: meta, ticks". "Dashed line: provisional".
2. Each component shows all its states, each with an exact spec. Example: "hover: outer hairline at ink-3, 120 ms". The frozen states and the live playground come from the same render function.
3. CSS reads state from data attributes (`data-dimmed`, `data-tuned`). `@property` lets CSS animate a number, for example a fill.
4. Data drives the look. A fill or a font weight shows a value. All numbers are tabular.
5. Motion has a meaning. Hover is 120 ms and linear. Anything under the finger moves in 0 ms. One long motion (600 ms, out-expo) explains where a thing went.
6. It feels instant. It starts to fetch what the user needs next, cancels stale work with `AbortController`, draws once for each frame, and shows no loading state for a result that arrives at once.
7. Sound uses the grammar of the picture. The hand makes short marks. The model answers in tones. A settled state ends on a plain sine. Pitch shows a value. The most frequent sound is the quietest. Silence is the default.
8. The sound engine is small. Each sound is a few numbers on native Web Audio nodes, with a voice cap, a limiter and one shared room. A failed sound never stops the action.
9. The stack is small: Vite, TypeScript, two runtime packages, no framework. A simulator runs until live keys are added.
10. The process is public. The swatch pages and the soundboard are the record of each decision.

## Direction: a kitchen instrument

The app is a precise instrument made from the materials of an Indian kitchen. It is classy, neat and minimal, not literal. Paper and ink carry most of the screen. Colour shows only where it has a job ("Colour and theme"). The character comes from the working objects of an Indian food counter, not from festival decoration. Take the function of each object.

| Object | Function we take | How it shows |
|---|---|---|
| Receipt slip (bill book) | The order slip: a number, labelled rows, and the total under a hairline. The model fills the rows. The seller confirms them. | Paper with a light brass-tint border, and two ticket notches on a dashed tear line under its head. No texture and no torn edge. |
| Rubber stamp | A status is a stamp: one tap, one mark, no doubt. Example: PAID. | Kumkum, leaf or ink ("Rules for the look") |
| Electronic weighing scale | One large fixed-width number with its unit, readable from a distance. | Numbers in IBM Plex Mono |
| Railway station board | Two scripts on one line, at matched size: an item name in the seller's script and in the buyer's script. The app text is in one language: the reader's own. | Both scripts in Anek |
| Price card on the counter | For buyers: one dish on each line, with its pack and its price aligned in tabular numbers. | The dish lines of a cook card, with hairlines between them. Packs and prices in mono |
| Dabbawala box code | The order number on each order slip: short, and readable at a glance. | A short number in mono |
| Steel dabba and katori | The objects of the icon set, and the sounds of the kitchen. | Ink lines with one brass-tint fill |

## Colour and theme

1. One theme: light. Dark text on a light ground reads best in a bright kitchen.
2. Each colour has one job, written next to its token. Take colours only from this table.

| Token | Value | Job |
|---|---|---|
| paper | `#FAF6EE` | The ground |
| ink | `#1F1A16` | Text, icons and the filled part of a measure (16:1 on paper) |
| ink-2 | `#5C5248` | Labels, units and meta text (7:1) |
| ink-3 | `#8A8076` | Disabled controls and closed days (3.6:1) |
| ink-tint | ink at 8% | Tint grounds: the words that the model heard, and a plain control while it is pressed |
| brass | `#9C7430` | Structure: hairlines, edges, gauge ticks and the busy line, in place of shadows (3.9:1) |
| brass-tint | `#EADCC2` | The one fill of the icons, the light border of cards, chips, tabs and selects, and the flat edge under a card |
| ink-dim | ink at 30% | Dims the page behind a dialog |
| haldi | `#E2A230` | The one primary action on each screen (ink on haldi 7.8:1) |
| kumkum | `#B3262D` | Still needs her: NEW, MAKING, SOLD OUT, Full, errors (6:1). Also the red end of the festive Special tag (rule 13 of the look) |
| marigold | `#B04A00` | Warm accents: the warm end of the festive Special tag's gradient to kumkum, and the kind of shop and the stars at the head of a cook card (5.1:1, so both pass AA) |
| leaf | `#27703A` | Finished, open or confirmed: READY, PICKED UP, DELIVERED, PAID, open capacity, and confirmations such as "Order saved" (5.6:1) |
| fssai-brown | `#7A3E14` | The FSSAI non-veg mark only |

3. Leaf is the one exception to rule 2: it also colours the FSSAI veg mark. Shape keeps the two jobs apart. The veg mark keeps its regulated square and dot, and a confirmation is a stamp with a word. Brown is the non-veg mark only.
4. A colour never carries meaning alone. Each colour job also has a word, a mark or a shape.
5. No blurred shadows. A card has a light brass-tint border and a flat 2 px edge under it. Other edges are brass hairlines.

## Icons

1. Buttons carry words. An icon helps a word. Only universal controls (mic, plus, minus, close) can be an icon alone, with an accessible name.
2. One custom icon set, drawn for this app: Indian working objects, clean lines, palette colours. No stock icon set and no emoji. Each icon is one SVG file in `src/icons/`. `npm run icons` builds them into one sprite, `src/public/icons.svg`, and a page places an icon with `<use>`.
3. The set: mic, stop, plus, minus, cart, share, location, message, check, undo, close, search, filter (three slider lines) and block (a circle with a slash: not allowed); the categories sweets, snacks, savouries, meals, catering and bulk; pickup and delivery. Example: a tiffin carrier for the cart.
4. The FSSAI veg and non-veg marks follow the regulation exactly. An egg item shows the non-veg mark and the word "Egg", because FSSAI counts egg as non-veg.
5. The style: ink lines with round ends (1.75 px at 24 px) and one flat brass-tint fill on the main surface. Icons that are only lines (plus, minus, check, close, undo and the chakli spiral) have no fill. On an ink ground (the brand tile, a chosen tab, segment or chip, a pressed plain button and the current step), an icon has paper lines and no fill, because a brass-tint fill beside paper lines blurs on ink (one rule in `src/styles/components/icon.css`). The drawings are the redraw in `extra/icons-2.html`, except Catering and Bulk, which keep draft 1. The team can redraw any icon.

## Rules for the look

1. This build is a laptop website, at 1280 px and wider. Build and test for that. Phone layouts are on the roadmap (`README.md`, "Roadmap"). The layout is an app bar, simple cards in grids, chips and pill buttons, in our palette, fonts, icons, stamps and motion rules. The page uses the full width of the screen, not a centred column: 32 px side margins at 1280 px and 40 px at 1440 px (`--page-margin`), on the same edges as the app bar. On a wide monitor, the page stops growing at 120rem (`--page`). Grids add columns as the page widens. Long text, such as the privacy page, keeps a reading width of about 44rem, on the left edge.
2. Body text is 16 px or more. A quantity or a total can be much larger. One type scale: five steps at a ratio of 1.25 from 16 px (`--step-0` to `--step-4`). One spacing unit: 8 px (`--space`). Density is roomy: controls are 44 px tall, and cards have generous padding.
3. Indian scripts are first-class. Show each component with Hindi and Kannada text. Indian scripts need more line height than Latin: 1.45 for Latin, 1.55 for Devanagari and Tamil, 1.65 for Kannada and Telugu. Use `:lang()` for the line heights. The Anek scripts already share one size, so `font-size-adjust` only keeps the fallback fonts at that size. Never set Indian-script text in a light weight.
4. Money and quantities use tabular numbers, Latin digits in all six languages, and Indian grouping (`Intl.NumberFormat("en-IN")`, with `maximumFractionDigits: 0` for whole rupees, for example ₹1,25,000).
5. The check screen, where the seller checks a draft, is a "check answers" list: one row for each field, the words that were heard, and a **Change** action. A value that the model filled is dashed until the seller confirms it. The button names the action, for example **Save order**.
6. Type: Anek (Ek Type) for words in all six languages, at normal width. IBM Plex Mono for numbers: prices, weights, counters, order numbers and timers. Self-host both, trimmed to the weights in use (Anek 400 to 700, Plex Mono 400 and 600). Each script is its own font file with a `unicode-range`, so a page loads only the scripts that it shows. `font-display: swap` makes sure that a page never waits for a font. Both use the SIL Open Font License: credit them in the README.
7. No unread counts and no red dots in the app.
8. Status badges always show. Each one tells the truth about what the screen shows.
9. Photos are the seller's own. Her store's cover photo has one fixed ratio, 4:1, long and low like a name board. Items show no photo. Without a cover photo, the setup preview shows a plain tile with her name in type, never a stock image. The browser shrinks each photo before upload, so pages stay light.
10. Each visual property has one job. If a line, colour or motion has no job, remove it.
11. Corners are Apple's squircle: a superellipse with continuous curvature, never a plain arc. One rule in `src/styles/base.css` gives every rounded corner `corner-shape: squircle`; a browser without it draws the plain radius. The tokens are calibrated by eye to the cards of apple.com's product pages (28 px and 18 px arcs). A squircle cuts less deep than an arc of the same radius, so each token is larger: dialogs and large surfaces 48 px (`--radius-card`); cards, slips and panels 32 px (`--radius-card-small`); inputs and the boxes inside a card 24 px (`--radius-input`; a 44 px field caps it at 22 px, which reads as Apple's 12 px field). Icon-sized squares, such as the brand tile, take Apple's icon corner: 22.37% of the width, times 1.84 for the squircle (`--radius-tile`). Buttons, chips, tabs and selects stay fully round pills with round ends, as on apple.com. Stamps stay square, and status badges and the Special tag keep a round 4 px corner. An order slip has two round ticket notches on its sides. The options are in `extra/components.html`, block 16.
12. The primary button has a haldi face, a 2 px ink border and a 4 px ink edge under it. Pressed, it moves down 4 px and the edge goes. The same action repeated for each item of a list (for example **Contact seller** on each bulk cart) counts as the screen's one primary action, so each copy has the primary look.
13. A stamp is an uppercase word in a 2 px box. Kumkum marks a status that still needs her (NEW, MAKING). Leaf marks a finished one (READY, PICKED UP, DELIVERED, PAID). On a board post, OPEN is leaf and CLOSED is ink. The Special tag of a festival dish is not a stamp: the word in sentence case, in a marigold-to-kumkum gradient, inside a 1.5 px frame of the same gradient with 4 px corners. It reads as a festival special, not as a status. Where a browser cannot clip a gradient to text, the word is kumkum. The options are in `extra/components.html`, block 15. Her hand stamps tilt by 3°, at an angle fixed for each order. A system stamp, for example NEW, or PAID from an online payment, is straight.
14. The capacity gauge has one segment for each unit of the daily limit, 25 at most. Booked segments are ink and open segments are leaf. The load of a draft order is dashed until she saves it. A full day shows "Full" in kumkum.
15. A status badge is a word in sentence case, in ink-2, in a 1 px brass box with 4 px corners. It has no colour and no capitals, so it never reads as a stamp, and no ink border, so it never reads as a button.
16. The app bar carries the brand tile (an ink tile with the handi of the Catering icon, which reads better than the thali at 24 px; a diya would be a cliché), the wordmark, the status badge and the store. The wordmark is the name of the whole product, so it is the largest words in the bar (step 3, Anek 700). At its end, the controls are one block on every page: **City** and **Sound** side by side at one width, and **Language** under both, across their width, all 44 px pills in paper. The language select names each language in its own script. A page with no city choice (the desk, the package editor, Make your store and the developer console) has Sound across the top row. On the pages of one store, the city is the store's own, locked: a hover, a focus or a click shows the block icon and why. The status of the page wraps beside the block. There is no demo nav: the desk has one plain **View your store** link, and no seller or buyer page links to the developer console. The start page for visitors (`/demo`) is the one page that links to every side, the demo desk and the console. It has no controls in its app bar, because it plays no sound and its words are English only. Each of its cards has one button, and each button has the primary look (rule 12).

## Interaction and motion

1. A control shows its pressed state in the frame that the finger touches it. The action happens when the finger lifts.
2. Anything under the finger moves in 0 ms. Hover takes 120 ms, linear. A stamp lands in 120 ms, with no overshoot.
3. The long motion (600 ms, out-expo) explains where a thing went. It has two uses: a saved order slip moves to its day on the order board, and the buyer's first pack moves into the total of the cart card.
4. Page moves feel effortless and quick. Pages use cross-document view transitions: a 200 ms cross-fade, and a 200 ms morph of one shared element. The shared element is the cart total: it moves from the cart card of the store page into the slip of the checkout page, and from there into the slip of the order page. Chrome also prerenders a link when the pointer presses it. Other browsers change the page at once. There is no client-side router.
5. Waits: under 300 ms, nothing new shows. After 300 ms, a quiet busy mark shows on the control that started the wait: a 2 px brass line sweeps along the inside of its bottom edge (on a link button, in place of the underline). With reduced motion, the line stays still. After 1 s, real progress shows in words, for example "Reading the voice note · 4 s". The old content stays until the new content arrives.
6. Recording: tap to start, tap to stop. A live level meter and a timer show that the app is listening. The meter has 20 cells, ink up to the level and brass outlines after it, like the capacity gauge. The timer shows the time and the 5:00 limit in Plex Mono. Recording has no colour of its own. Long recordings split into parts (`docs/system.md`, "Reading pipeline").
7. Steppers (+ and −): holding a stepper repeats the step. Each step plays one note, and the pitch follows the quantity.
8. A full day shows as closed, with the reason in words.
9. No network: the action stops with "No network. Try again." The typed text and the recording stay on the screen.
10. With `prefers-reduced-motion`, motion becomes an instant change. Words and sound still show the state.

## Copy

1. Use the everyday mix that people speak. Common English words stay, written in the reader's script: order, cart, OTP, UPI, pickup, delivery.
2. Use the respectful "you": aap (Hindi), neevu (Kannada), neengal (Tamil), meeru (Telugu), tumhi (Marathi).
3. English text is Indian English, with British spelling.
4. A button names its action. Each sentence is short and uses the user's words.

## Do not (AI slop)

- Purple or blue gradients, gradient text, glass cards, glow, blobs, noise backgrounds. The one exception: the marigold-to-kumkum Special tag (rule 13 of the look). Marigold also colours the kind of shop and the stars of a cook card.
- The next default: a cream background with an italic serif. Do not swap one default for another.
- Inter, Geist, Space Grotesk or Instrument Serif. Emoji as icons. Sparkles to mark AI. A stock icon set.
- Grids of rounded cards with soft shadows, cards inside cards, a large radius on everything, a coloured stripe on a card edge, an icon on top of each card.
- A small pill label above a heading, 1-2-3 steps, a row of big stats, a hero section, a marketing tagline inside the app. The one exception: the product tagline under the name on the homepage.
- Colour with no job. A rainbow of colours.
- Indian clichés: mandala, marigold, diya, paisley, rangoli, saffron gradients, Latin fonts that imitate Devanagari. Authentic means working objects and real lettering, not festival decoration.
- Bounce easing. Spinners for local actions. "AI is thinking…" with no real status. Missing error states.

## References

Each line gives what to take.

Craft:

- Rauno Freiberg, Invisible Details of Interaction Design (https://rauno.me/craft/interaction-design): rules from frequency, interruption and Fitts's law. Commit an action when the finger lifts.
- Emil Kowalski, You Don't Need Animations (https://emilkowal.ski/ui/you-dont-need-animations): frequent actions get no motion. UI motion stays under 300 ms. The long motion (600 ms) is the exception.
- Apple, Human Interface Guidelines, Motion (https://developer.apple.com/design/human-interface-guidelines/motion): brief, precise feedback feels light. Avoid motion on frequent actions. Never make people wait for an animation.
- MDN, Using the View Transition API (https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using): both pages opt in with `@view-transition { navigation: auto; }`. One unique `view-transition-name` for each shared element.
- MDN, Speculation Rules API (https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API): prerender is a hint. A prerendered page runs its JavaScript, so it must not write on load.
- teenage engineering, OP-1 guide (https://teenage.engineering/guides/op-1/original/layout): each colour tells which control changes a value. Colour with a job, no exceptions.
- Every Layout, Axioms (https://every-layout.dev/rudiments/axioms/): set rules and let the browser compute. Few breakpoints.
- Utopia (https://utopia.fyi): one type scale and one space scale, as tokens.
- The Monospace Web (https://owickstrom.github.io/the-monospace-web/): everything snaps to a character grid. Take its tables: the daily list is a table, with its packs and amounts in tabular mono.
- Low-tech Magazine, the solar website (https://solar.lowtechmagazine.com/about/the-solar-website/): small pages, system state always visible.
- Brutalist Web Design (https://brutalist-web.design/): buttons look like buttons. Performance is a feature.
- GOV.UK Design System, Check answers (https://design-system.service.gov.uk/patterns/check-answers/): the pattern for the check screen.

India:

- Trilingual station boards, Kannada, Hindi and English (https://commons.wikimedia.org/wiki/Category:Trilingual_English-Hindi-Kannada_signs_in_India): fixed script order and equal size.
- Receipt slip from a tiffin centre (https://commons.wikimedia.org/wiki/File:Foodmessbillmarch.jpg): a number, labelled rows and a boxed total. The model for the order slip.
- Essae DS-252 shop scale (https://www.essae.com/product/ds-252-electronic-digital-scale/): large fixed-width digits, and a second display that faces the buyer. The model for totals.
- Mumbai dabbawalas (https://en.wikipedia.org/wiki/Dabbawala): box codes in colours, numbers and symbols, read at a glance. Do not quote the "one error in six million" claim: it is disputed.
- Ek Type, Anek (https://ektype.in/anek-family.html): ten scripts made to sit together. The benchmark for mixed-script lines.
- Zerodha, User disengagement (https://zerodha.tech/blog/user-disengagement/): no manufactured red dots.
- Alar (https://alar.ink): Latin typing finds Kannada words. Search works in either script.
- CRED NeoPOP (https://github.com/CRED-CLUB/neopop-web): a strict system with a pressable, raised button. Take the button, in plain CSS. Do not take its neon style.

What AI slop looks like:

- Adrian Krebs, design slop tells (https://www.adriankrebs.ch/blog/design-slop/)
- Anthropic, Improving frontend design through skills (https://claude.com/resources/articles/improving-frontend-design-through-skills)
- Signs of AI design slop (https://github.com/febbhav/signs-of-ai-design)
- prg.sh, Why your AI keeps building the same purple gradient website (https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)

## Inputs for the rounds

The prompts are in `extra/README.md`. Fill them with:

- Product line: one web app for Indian food for festivals, weddings and parties. A home cook takes the festive pre-order rush without missing an order or promising more than she can make.
- Product name: Plattr. Tagline: "From a dozen to a thousand". It sits under the name in the homepage's app bar, and at the top of the README. This is the one tagline in the app (see "Do not (AI slop)").
- People: `docs/concept.md` ("Persona").
- Directions for round 1: bill book, station board, steel counter and dabbawala marks. The team set its own direction instead ("Direction", "Colour and theme").
- Key components:
  - Seller: the **Say an item** step in setup, the record button with its level meter and timer, the check screen (the transcript with the heard words marked, and the fields, dashed until confirmed), the order slip on the order board, the daily list.
  - Buyer: the item card with its pack chips and **+** / **− 1 +**, the cart card with its total, the day picker with full days closed, the code step, the order page with the message log, the plate builder with its limits.
  - Both: the status badges, the icon set ("Icons"), the page morph of the cart total.
  - Developers and demos: the one-line trace of a reading on the check screen (`cfg_demo_trace`): language, path, variant, time.
- Sound roles and needs: `docs/sound.md` ("Roles", "Needs").
- Real content: the stores, menus, prices and voice lines in `docs/demo-data.md`, in English, Hindi and Kannada.
