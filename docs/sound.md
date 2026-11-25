---
title: Sound
purpose: What each control and event needs to sound like, the one family of Indian sounds that meets those needs, and the engine that makes them.
read-when: You add, change, wire or test a sound, the soundboard, or the vibration.
owns: sound needs, sound roles, sound family rules, sound palette, sound timing, loudness tiers, sound synthesis, sound engine, sound tests, sounds to avoid
---

# Sound

The code rules are in `AGENTS.md` ("Sound"). The soundboard, `extra/soundboard.html`, plays every role and take of this file. It marks the takes of the palette "in the build". Its synthesis is `extra/sound-synth.js`. `extra/sound-kits.html` holds the first kits. The app plays the picks with its own engine in `src/sound/` ("Engine"). The checks in "Tests" run on both.

## One family

Every sound comes from one Indian food counter, tuned to one raag and heard in one room. The sounds differ in what they say, not in where they come from. The objects are real kitchen and counter objects, so people know them. The pitch, rhythm and room are those of a musical set, so the sounds belong together and stay pleasant when heard all day.

1. One raag: Bhupali on E (Sa 329.63 Hz; ratios 1, 9/8, 5/4, 3/2, 5/3). The prime (the lowest strong mode, or the fundamental) of each pitched sound sits within ±5 cents of a swara. Commits and heroes end on Sa. Only the error sound uses Ma (4/3), the one note outside the raag.
2. Three families, each with one meaning. Never mix the meanings.

   | Family | Material | It says |
   |---|---|---|
   | Hand | Tabla: dayan and bayan strokes; a kulhad set down, for the tick | What you did, by hand or by voice, and what stopped it |
   | Counter | Paper slip, ink pad, rubber stamp, wood | A commitment that goes on record |
   | Steel | Katori, tumbler, glass, tiffin latch, bicycle bell | The app and the shop answer |

3. One sound logo: the slip is torn from the bill book and stamped, then the positive ending answers (the seller's "order saved"). Other sounds quote its parts: "settle" is the positive ending alone, "commit" is the slip or the stamp and then the ending, the buyer's "order placed" packs the dabba and then ends the same way, and PAID quotes the stamp.
4. Positive and negative. Each sound that reports an outcome uses one of two gestures. So all positive sounds sound alike, all negative sounds sound alike, and the two never sound alike.
   - Positive (it worked): the positive ending. A katori on the lower Pa (989 Hz), then a katori up on Sa (1318.5 Hz) 80 ms later, which rings. High, steel, a step up to Sa. Roles: settle, commit, saved, placed.
   - Negative (a rule said no, or it failed): the negative fall. The bayan glides down and dies away. Low, skin, a slide down. Roles: limit, error, cancel, fallback, unsure. The error lands on Ma; the others land in the raag.
   - No other role uses either gesture. A positive sound waits for the server's reply ("Timing and behaviour").
5. Stroke count gives weight: 1 stroke acknowledges, 2 strokes change a state, 3 strokes mark the hero.
6. Direction gives meaning: up is start, add, open; down is stop, remove, close. A mirrored pair plays the same strokes in reverse.
7. One room, one master bus and one limiter for every sound ("Engine").
8. One loudness ladder: the more often a sound plays, the quieter it is ("Loudness, band and variation").
9. One shared exciter: each struck sound starts with the same click.
10. Small details vary on each play. Pitch, material and rhythm never vary.

## Roles

A role is what a sound must say. Code plays roles, never raw sounds. Tier 1 is the quietest, tier 4 the loudest.

| Role | It says | Outcome | Family | Strokes and contour | Length | Tier |
|---|---|---|---|---|---|---|
| tick | Got it | – | Hand | 1, flat | ≤ 30 ms | 1 |
| step | The new quantity | – | Hand | 1, up or down to the swara of the quantity | ≤ 120 ms | 1 |
| pick | In or out of my choice | – | Hand | 1, up (in) or flat and closed (out) | ≤ 120 ms | 1 |
| record | Microphone open, microphone shut | – | Hand | 2, up (start) or down (stop) | ≤ 120 ms | 3 |
| limit | A rule said no, and another option exists | Negative | Hand | The negative fall, landing in the raag | ≤ 300 ms | 2 |
| error | It failed: do the next step | Negative | Hand | The negative fall to Ma, with a slap | ≤ 300 ms | 3 |
| stamp | I set this status | – | Counter | 1, the same for every status; PAID: the ink pad, then the stamp | ≤ 300 ms | 2 |
| commit | Sent, or published | Positive | Counter | The slip (or the stamp, to publish), then the positive ending | ≤ 600 ms | 3 |
| cancel | Released | Negative | Counter | The slip torn fast, then the negative fall | ≤ 400 ms | 2 |
| undo | Reversed | – | Counter | 2, falls | ≤ 150 ms | 2 |
| cascade | Your words became fields | – | Hand | 1 'tin' for each field, climbing to upper Sa | ≤ 300 ms | 1 |
| unsure | Check this field | Negative | Hand | In the cascade, the field's note becomes a small fall | ≤ 150 ms | 1 |
| settle | Done: the server agreed | Positive | Steel | The positive ending | ≤ 500 ms | 2 |
| avail | Buyers can or cannot order now | – | Steel | 1 pair (2 for pause and resume), up to open, down to close | ≤ 250 ms | 2 |
| working | The app is reading, nothing is final | – | Steel | a short train, fading | ≤ 1 s | 2 |
| fallback | Voice failed, your words are safe | Negative | Hand | A small negative fall, landing on Sa | ≤ 300 ms | 2 |
| arrival | Someone ordered | – | Steel | 2 bursts | ≤ 800 ms | 4 |
| saved | Order saved (seller) | Positive | Logo | The slip, the stamp, the positive ending | 600 ms | 4 |
| placed | Order placed (buyer) | Positive | Logo | Three tiffin tiers, the latch, the positive ending | ≤ 600 ms | 4 |

## Needs

Each control or event, and its role. Anything not listed is silent: tabs, links, typing, search results, filters (**Need it by**, veg, sort, categories, location), page moves, background saves, waits under 1 s, the daily list as it updates, and the message log.

| Surface | Control or event | Role |
|---|---|---|
| Store page | A pack size | tick, on the pack's swara: 250 g Sa, 500 g Ga, 1 kg Pa; a fourth pack Dha, then upper Sa |
| Store page | **+** and **−**, holding repeats | step |
| Store page | A day | tick |
| Store page | A full, closed or booked day, or "not taking orders" | limit |
| Store page | Voice cart | record, working, cascade, unsure, fallback |
| Homepage | Voice search | record, working, cascade (one note), fallback |
| Checkout | Order placed, on the server's reply | placed |
| Checkout | Wrong code, no network | error |
| Checkout | The day filled meanwhile | limit |
| Payment page | **Pay** (prototype), on the server's reply | settle (placed, when this payment places the order) |
| Payment page, order page | A payment that failed or did not start | error |
| Order page | **Message the store** | commit, at the tap |
| Catering | Pick or drop a dish | pick |
| Catering | A plate over its limit | limit |
| Catering | Switch to a package that fits | settle |
| Catering, bulk | The request from **Contact seller**, on the server's reply | commit |
| Catering, bulk | **Send on WhatsApp** | commit, at the tap |
| Bulk | A quantity under the minimum | limit |
| Board posts | Post | commit |
| Board posts | Close a post | cancel |
| Board posts | Undo the close | undo |
| Desk | **I can do this** | commit |
| Seller setup | **Say an item**, by voice or in words | record, working, cascade, fallback |
| Seller setup | **Add this item** | commit |
| Seller setup | Publish | commit, publishing form |
| Desk | A new order | arrival |
| Desk | A new quote request | arrival, one burst |
| Desk | Stamp MAKING, READY, DELIVERED or PICKED UP | stamp |
| Desk | Stamp PAID for cash | stamp, PAID form |
| Desk | An online payment marks PAID (prototype) | settle |
| Desk | Undo a stamp, PAID, an edit or a saved order; keep an order during its cancel or refund hold | undo |
| Desk | Save an edit | settle |
| Desk | An edit that breaks the daily limit | limit |
| Desk | Cancel with a reason | cancel |
| Desk | **Refund** (prototype) | tick at the tap, because the 10 s hold is not a reply; commit on the reply |
| Desk | Sold out and available again; close and reopen a date | avail |
| Desk | Pause and resume | avail, both latches |
| Desk | Record an order, stop | record |
| Desk | Reading passes 1 s | working, once |
| Desk | The draft fields fill | cascade |
| Desk | A field not heard, or a near match | unsure |
| Desk | Confirm or **Change** a field | tick |
| Desk | The order does not fit the day | limit |
| Desk | Reading failed, the typed or heard words stay | fallback |
| Desk | A file refused, nothing usable | error |
| Desk | **Save order**, on the server's reply | saved |
| Desk | **Send on WhatsApp** | commit, at the tap |
| All pages | Sound and vibration turned on | tick |
| All pages | No network | error |

The demo desk plays what the desk plays, after the first tap.

## Palette

The team picked one take for each role on the soundboard, and `src/sound/sounds.ts` plays these picks. To tune a take by ear, change it in `extra/sound-synth.js` (its `PICKS` table names the take of each role), keep the rules in "One family", and run the checks. Then copy the take into `src/sound/sounds.ts` and run `npm test`. The swaras are in "Pitches".

| Role | Outcome | Take | The sound |
|---|---|---|---|
| tick | – | (c) kulhad tok | A dry clay cup set down on Sa (659 Hz). A pack size plays it on the pack's swara |
| step | – | (a) tabla tarang 'tin' | A dayan 'tin' on the swara of the new quantity: 1 to 10 maps to Sa to upper Dha; 0 plays a closed 'te' |
| pick | – | (a) 'na' on Pa, or 'te' | In: dayan 'na' on Pa. Out: a closed 'te' |
| record | – | (a) 'na–tin' up, 'tin–te' down | Start: 'na' on Sa, then 'tin' on Pa, 60 ms apart. Stop: 'tin' on Pa, then a closed 'te' |
| limit | Negative | (a) the negative fall | The bayan 'ge' falls from Sa (330 Hz) to lower Dha (275 Hz), 316 cents in 220 ms |
| error | Negative | (a) the negative fall to Ma | The bayan falls 400 cents to Ma (220 Hz) in 220 ms, with a closed left-hand slap |
| stamp | – | (f) a real rubber stamp | Modelled on measured recordings of real stamps ("Synthesis"). The same stamp for every status. PAID: the ink pad, then the stamp |
| commit | Positive | (f) the slip or the stamp, then the positive ending | Sent: the slip torn from the bill book (perforation clicks speeding up from 80 to 250 a second over 250 ms, then the paper flap), then the positive ending at 300 ms. Publish: the stamp, then the positive ending at 120 ms |
| cancel | Negative | (e) the slip torn fast, then the fall | The slip torn fast in two (120 ms, the band falls from 6 to 2 kHz), then the fall of limit, from 100 ms |
| undo | – | (a) two light wood taps | Wood on Pa, then on Sa, 70 ms apart |
| cascade | – | (f) tabla tarang 'tin' | One 'tin' for each field, 45 ms apart, climbing to upper Sa (659 Hz). An unsure field plays a small fall instead |
| unsure | Negative | (e) a small fall in the cascade | The field's note is the bayan falling from Re to Sa in 150 ms, 4 dB softer than the other notes |
| settle | Positive | (f) the positive ending | A katori on the lower Pa (989 Hz), then a katori on Sa (1318.5 Hz) 80 ms later, with a spoon click on each; free ring of 0.4 s, so commit and placed end within 600 ms |
| avail | – | (a) tiffin latch | Open: two snaps 40 ms apart, Sa then Pa. Close: Pa then Sa. Pause and resume: both latches, 120 ms apart |
| working | – | (a) a spoon stirring a glass of chai | 5 soft glass clinks in 0.9 s, alternating Pa and Sa, each 3 dB softer |
| fallback | Negative | (e) a small fall to Sa | The bayan falls from Re to Sa (204 cents) in 150 ms |
| arrival | – | (a) bicycle bell | Two domes on Pa (1977.8 Hz) and Dha (2197.5 Hz), struck 30 times a second with ±15% timing jitter, a 2 ms click on each strike; two bursts of 350 ms, 450 ms apart. A quote request rings once |
| saved | Positive | (f) the slip, the stamp, the positive ending | The slip (0 to 250 ms), the stamp at 300 ms, the positive ending at 420 ms |
| placed | Positive | (f) the dabba, then the positive ending | Three tiffin tiers stacked on Sa, Re and Ga, 70 ms apart; the latch at 220 ms; the positive ending at 300 ms |

Where a rule changed a take the team picked, the soundboard keeps the take they heard next to the new one:
- Rule 4 (positive and negative): cancel (a) was the tear alone; fallback (a) and unsure (a) were held katoris; cascade (c) played an unsure field as a 'te'; commit (a) sent the slip alone; settle (e) and saved (d) stepped down from the upper Pa to Sa; placed (c) ended with the latch on Pa, then Sa.
- The real stamp: the stamp (f) replaces the noise-band stamp (b).

The kulhad of the tick joins the Hand family. A take that adds another material (santoor, matchstick, breath, tadka, ladle) breaks rule 2 of "One family". Select it only if it replaces a family's material everywhere, not in one role.

## Pitches

Bhupali on E, in Hz. Octave 0 holds the Sa near 330 Hz.

| Octave | Sa | Re | Ga | Pa | Dha |
|---|---|---|---|---|---|
| −1 | 164.8 | 185.4 | 206.0 | 247.2 | 274.7 |
| 0 | 329.6 | 370.8 | 412.0 | 494.4 | 549.4 |
| 1 | 659.3 | 741.6 | 824.1 | 988.9 | 1098.8 |
| 2 | 1318.5 | 1483.3 | 1648.1 | 1977.8 | 2197.5 |
| 3 | 2637.0 | 2966.7 | 3296.3 | 3955.6 | 4395.1 |

- Drums sit in octave 0, with the bayan below. Steel and glass sit in octaves 2 and 3; the positive ending starts lower, on the Pa of octave 1 (988.9 Hz). Steel stays at or below upper Sa (2637 Hz): higher steel reads as glass.
- Ma, for the error only: 219.8 Hz and 439.5 Hz.

## Timing and behaviour

1. A sound starts in the frame of the change that it reports: attack 2 ms or less, no leading silence.
2. Hand sounds are 120 ms or shorter. State sounds are 300 ms or shorter. The heroes span 600 ms. Strokes inside one gesture are 40 to 80 ms apart; the two notes of the positive ending are 80 ms apart. The parts of one sound (the slip, the stamp, the ending) are 100 to 300 ms apart. Separate sounds start at least 100 ms apart, but a sound never waits more than 160 ms.
3. Steppers: notes stay at least 60 ms apart. A step that comes sooner waits, and the steps after it merge into it. So notes are skipped, but the last quantity always plays, and the queue is never more than 60 ms behind the hand.
4. Positive sounds (settle, commit, saved, placed) play on the server's reply, never on the optimistic save. A commit that only leaves the page has no reply to wait for, so it plays at the tap (rule 8). **Add this item** in setup goes into her draft in the browser, so its commit also plays at the tap. **Save order** waits for the reply. Then the slip moves for 600 ms to its day on the board, and "saved" starts with the move, so that its main hit (the stamp, 300 ms in) lands when the move is 97% done. A failed save plays the error, and the check screen keeps her values.
5. At checkout, one tap checks the code and places the order, so it plays "placed" only.
6. Recording: the start mark ends before the microphone opens. The stop mark plays after the microphone tracks stop. While the microphone is open, no other sound plays. An arrival waits and rings once, 350 ms after the microphone closes.
7. Arrival: one bell for each burst. Another order within 10 s shows on the board with no bell.
8. A sound that comes with leaving the page (**Send on WhatsApp**, **Message the store**, and the next page after an order is placed or paid) starts first. The next page opens 150 ms later.
9. A prototype payment never sounds like money. **Pay** and an online PAID play "settle".
10. Vibration, on Android only: the buzz count matches the sound. Record start and stop: one 15 ms buzz. Order saved: three 20 ms buzzes, 60 ms apart. Arrival: two 40 ms buzzes, 80 ms apart. A quote request: one 40 ms buzz.
11. `prefers-reduced-motion` does not change sound.

## Loudness, band and variation

- Loudness tiers, start values, to tune on phones: tier 1 −32, tier 2 −27, tier 3 −23, tier 4 −20 dB. Measure each buffer once, when it renders: the high shelf of K-weighting, a 400 Hz high-pass for the phone, and the loudest 100 ms window. Then scale the buffer to its tier. A sound names its tier, never a raw gain. Each sound is within ±1 dB of its tier. Peaks stay at −3 dBFS or lower before the limiter.
- Band: phone speakers peak near 800 Hz and lose 12 dB for each octave below it. At least 90% of the energy is above 300 Hz. No prime is below 200 Hz, and 2% of the energy at most is below 200 Hz. A part below 600 Hz keeps at least three partials between 600 Hz and 3 kHz, so the ear still hears its pitch. Each buffer is high-passed at 180 Hz when it renders: modes that start together and decay fast leave a small offset, and the high-pass removes it.
- Mono: each sound is one mono buffer, with no pan. Only the room is stereo.
- Variation: each frequent sound (tick, step, pick, stamp) has 3 renders, played in turn. A render varies the pitch by ±3 cents at most, the contact time by ±15%, and the level of each mode a little. Each play varies the level by ±1 dB. Fast repeats of one role, less than 250 ms apart, get 2 dB quieter each time, down to −6 dB.

## Synthesis

Each material is a set of modes, a damping law and a transient. Listeners tell ringing materials (steel, glass) from damped ones (wood) at once; inside a group, size decides. So material identity lives in the mode ratios, the damping and the transient, and the prime can move to a swara without loss.

- Damping law for every impact: d_n = d_hand + π · tan φ · f_n (per second), and T60_n = 6.91 / d_n. d_hand is 0 for a free object, about 20 for one held by the hand (T60 0.35 s or less), and about 180 for a closed stroke. A "free ring" caps the T60 of a struck object, for example 0.4 s for the katoris of the positive ending.
- Tuning: put the prime on a swara. Keep the physical ratios of the other modes. Solids have fixed frequencies: no glides on steel, wood or glass. Only skins (the tabla) bend.

| Material | Modes, ratio to the prime | tan φ | Prime | Transient |
|---|---|---|---|---|
| Tabla skin | Dayan: harmonics 1 to 5, with a weak fundamental and a strong second harmonic. Bayan: harmonics 1 to 4 | No tan φ: each stroke has a decay time for each harmonic. 'tin' rings longest (0.9 s to −80 dB), 'na' 0.5 s, the closed 'te' 0.05 s; in a step or a pick the hand stops the 'tin' or 'na' (d_hand 40), so it ends within 120 ms; the bayan rings 0.7 s, and adds the held hand term after its glide | Dayan Sa 330 Hz; bayan lower | The shared exciter; 'te' adds a 12 ms thud at 900 Hz, the bayan a 15 ms thud at 500 Hz; the pitch starts sharp (dayan 1.5%, bayan 1%) and settles in about 10 ms |
| Steel bowl (katori, tumbler) | 1, 2.83, 5.42, 8.77, 12.9; each mode a pair 2 Hz apart | 0.001, plus the hand term when held | 989 to 2640 Hz | A contact of 0.15 ms, and a spoon click (0.4 ms at 5 kHz) |
| Steel plate (latch, tiffin tier) | 1, 1.73, 2.33, 3.91, 4.11 | as steel | 990 to 2640 Hz | A contact of 0.5 ms; the latch snaps with two small rebounds, about 3 and 8 ms later |
| Brass (tarazu pan; a soundboard take, not in the build) | Plate ratios | 0.002 | 660 to 2200 Hz | A contact of 0.6 ms |
| Glass (chai glass) | 1, 2.83, 5.42 (the first bowl ratios); each mode a pair 1.5 Hz apart | 0.002; never damp it heavily | 1980 to 3960 Hz | A contact of 0.08 ms and a spoon click, with no exciter |
| Wood (stamp handle, counter) | 1, 2.78, 5.44, 9 | 0.06 | 330 to 990 Hz | A contact of 1.5 ms, which dulls the upper modes |
| Clay (kulhad) | 1, 2.6, 4.9 | 0.035, plus the hand term of a cup set down on the counter (d_hand 110), so the tick ends within 30 ms | 659 to 1319 Hz | A contact of 2 ms, dry |
| Bell (bicycle bell domes) | 1, 2.83, 5.42 | 0.001, with a T60 of 0.5 s at most | 1978 and 2198 Hz | A 2 ms click at 6 kHz on each strike |
| Rubber stamp and ink pad | No modes: layers of band-passed noise, each with its own onset, level, rise and fall, measured from recordings of real stamps | – | Stamp centred on Dha (549 Hz), ink pad on the Pa of octave −1 (247 Hz) | The layer timings vary by ±15%; the stamp adds the shared exciter at 6 ms, 26 dB down |
| Paper (slip) | Crackle, 2 to 6 kHz; the flap is noise band-passed at 1 kHz, 30 ms | – | – | Clicks of 1 to 3 ms |

## Engine

1. The primitives, in `src/sound/synth.ts`, each rendered once into a buffer:
   - `impact(material, prime, { force, hand, ring, click })`: the modes above. A contact time τ of the material weights mode n by 1 / (1 + (f_n · τ)²): a short contact sounds brighter. `snap` (the latch) is a plate impact with two rebounds, and `spoon` is the click of a spoon.
   - `dayan(stroke, f, hand)` and `bayan(f, bend)`: the tabla skins, whose pitch bends. `ka` is the closed left-hand slap.
   - `contact(f0, layers)`: the band-passed noise layers of the rubber stamp and the ink pad.
   - `crackle(rate, band)`: Poisson-timed clicks of 1 to 3 ms in a band, with event energies on a power law (exponent 1.5). `slipTear` is a crackle that speeds up, then the flap.
   - `bellBurst(strikes, domes)`: the bicycle bell.
   - The soundboard has more primitives (a Karplus-Strong string for the santoor, breath, scrapes) for takes that are not in the build.
2. Render fixed modes with the two-pole resonator recursion, y[n] = 2R cos θ · y[n−1] − R² · y[n−2], with R = e^(−d / sample rate): no `Math.sin` for each sample. A skin that bends (the tabla) uses a phase accumulator, and the resonator after its pitch settles.
3. The shared exciter: band-pass noise at 3.2 kHz, Q 1.5, 5 ms long, about 14 dB under the body, on each struck sound.
4. The room: one stereo impulse response of 0.6 s. Its highs die faster (T60 about 0.45 s at 1 kHz and 0.25 s at 6 kHz). It has a 5 ms pre-delay, and its return is high-passed at 300 Hz. Sends by role: hand sounds 0.04, answers 0.10, settle, arrival and the heroes 0.18.
5. The master chain: voices go to one bus, plus the room send. Then: a high-pass at 180 Hz, a low-pass at 12 kHz, a gain, then a `DynamicsCompressorNode` as a safety limiter (threshold −6 dB, knee 0, ratio 20, attack 1 ms, release 100 ms), then a trim that removes the compressor's own make-up gain. No other node connects to `ctx.destination`.
6. Rendering: the audio context and every buffer run at 48 kHz, so the buffers can render before the context exists. The core sounds render in idle time after the page loads, a few at a time, so recording and typing never wait. Another sound renders on its first use, and the other renders of a frequent sound follow in idle time. The cache key is the role, its parameters and the render.
7. Voices: 24 at most. Over the cap, a new voice takes the place of the oldest voice of the same role, or else the oldest voice. A voice that stops fades out in 20 ms.
8. Memory: the cache holds about 30 s of mono 32-bit audio at 48 kHz (about 6 MB), and drops the least recently used sound first. Trim tails at −60 dB.
9. After the page comes back from the background, resume the audio context on the next gesture. Treat the "interrupted" state as "suspended".
10. The code calls one function for each role, for example `sounds.step(quantity)` and `sounds.stamp(status)`.

## Tests

1. Unit tests over the sound table. `npm test` runs them on `src/sound/`. **Run the checks** on the soundboard runs the first four on `extra/sound-synth.js`.
   - each prime is within ±5 cents of a swara (Ma only in the error);
   - each rendered sound is within ±1 dB of its tier, with its peak at −3 dBFS or lower;
   - at least 90% of the energy is above 300 Hz, no prime is below 200 Hz, and 2% of the energy at most is below 200 Hz;
   - the take in the build of each positive role ends with the positive ending and has no fall; that of each negative role has the negative fall and no positive ending; no other take in the build uses either;
   - tick, step, pick, error, cancel and commit fit the length of their role, measured to −40 dB under the peak;
   - the timing rules (steps, separation, fast repeats, the bell, the hero offset, the voice cap), the room, the limiter trim, the vibration patterns and the setting.
2. Listening tests, on laptop and phone speakers, with three people or more:
   - an outcome sort: listeners put each sound in "it worked", "it did not" or "neither", 90% right or more;
   - a card sort puts 80% or more of the sounds in their family;
   - an odd-one-out test finds a foreign sound 80% of the time or more;
   - the scenario plays end to end and no sound stands out.

## Do not use

- Temple and hand bells, including the puja ghanti: a devotee rings one to tell the deity of their arrival, which is exactly our "arrival". Brass mortars and kansa thalis ring in the same way.
- Shankh: worship and aarti, Tamil funeral processions, and a party's election symbol.
- Manjira, aarti, nadaswaram, shehnai, singing bowls, azan, church bells, melody doorbells (a doorbell sends the seller to the door), a coconut crack, parai, damaru, dhol, fireworks.
- Clichés: sitar riffs, the pungi, a tanpura drone, tabla loops.
- Money sounds: coins, notes, a cash drawer, a counting machine, soundbox chimes. Our payments are simulated, and the stamp already marks PAID.
- Horns and whistles: an auto-rickshaw horn is an alarm and a noise complaint. A pressure-cooker seeti clashes with the cook's real cooker, whose whistles she counts.
- Ghungroo and bangles (the dance stage, brides), a matka (the word also names an illegal lottery), electronic beeps (they break the acoustic family), and thuds below 200 Hz (a phone does not play them).

## Sources

Family and grammar:
- Brewster, Wright and Edwards, An evaluation of earcons (CHI 1993): https://www.dcs.gla.ac.uk/~stephen/papers/CHI93.PDF
- Brewster, Wright and Edwards, Experimentally derived guidelines for the creation of earcons (1995): https://www.dcs.gla.ac.uk/~stephen/papers/HCI95.pdf
- The Sonification Handbook, chapter 13, Auditory icons: https://sonification.de/handbook/download/TheSonificationHandbook-chapter13.pdf
- The Sonification Handbook, chapter 14, Earcons (listeners turn off everyday sounds heard many times a day): https://sonification.de/handbook/download/TheSonificationHandbook-chapter14.pdf
- Material Design, Applying sound to UI and Sound choreography: https://m2.material.io/design/sound/applying-sound-to-ui.html, https://m2.material.io/design/sound/sound-choreography.html
- Material Design, Sound attributes ("Upward motion commonly indicates starting, openness, positivity, or assurance"; use unresolved melodies with caution): https://m2.material.io/design/sound/sound-attributes.html
- Apple, Designing Sound (WWDC17): https://developer.apple.com/videos/play/wwdc2017/803/
- Apple, Designing Audio-Haptic Experiences (WWDC19): causality, harmony, utility: https://developer.apple.com/videos/play/wwdc2019/810/
- Google Design, The sound of Pixel (one key for the whole set): https://design.google/library/google-pixel-sound-design-ux-conor-osullivan
- Microsoft Design, The sound of innovation (sounds made in isolation become a pastiche): https://microsoft.design/articles/the-sound-of-innovation-how-audio-designers-are-redefining-digital-experiences/
- SND, by Dentsu: https://snd.dev/
- Josh Comeau, use-sound (a mute setting that persists; never put information in sound alone): https://www.joshwcomeau.com/react/announcing-use-sound-react-hook/
- Spaceship, sound grammar and engine: https://github.com/chuanqisun/spaceship (`extra/soundboard.html`, `src/text/sound/`)

Objects and culture:
- Wikipedia: Tabla (https://en.wikipedia.org/wiki/Tabla), Jal tarang (https://en.wikipedia.org/wiki/Jal_tarang), Tiffin carrier (https://en.wikipedia.org/wiki/Tiffin_carrier), Bicycle bell (https://en.wikipedia.org/wiki/Bicycle_bell), Ghanta (https://en.wikipedia.org/wiki/Ghanta), Shankha (https://en.wikipedia.org/wiki/Shankha), Pressure cooker (https://en.wikipedia.org/wiki/Pressure_cooker), Matka gambling (https://en.wikipedia.org/wiki/Matka_gambling), Horn OK Please (https://en.wikipedia.org/wiki/Horn_OK_Please), Bhoopali (https://en.wikipedia.org/wiki/Bhoopali)
- Paytm Soundbox (https://business.paytm.com/soundbox) and PhonePe SmartSpeaker (https://www.phonepe.com/business-solutions/offline-merchant/smartspeaker/): the audible confirmation that Indian sellers know

Synthesis and mixing:
- Malu and Siddharthan, Acoustics of the Indian Drum: https://ar5iv.labs.arxiv.org/html/math-ph/0001030
- Patranabis and others, Harmonic and Timbre Analysis of Tabla Strokes: https://arxiv.org/abs/1510.04880
- Terwagne and Bush, Tibetan Singing Bowls (bowl and glass modes): https://arxiv.org/abs/1106.6348
- van den Doel and Pai, Modal Synthesis for Vibrating Objects (damping law, contact pulse, resonator recursion): https://www.cs.ubc.ca/~kvdoel/publications/modalpaper.pdf
- van den Doel, Kry and Pai, FoleyAutomatic (micro-collisions, scraping): http://www.cs.ubc.ca/~kvdoel/publications/foleyautomatic.pdf
- Rocchesso and Fontana (eds.), The Sounding Object (material perception, crackle): https://www.soundobject.org/SObBook/SObBook_JUL03.pdf
- Julius O. Smith, Extended Karplus-Strong Algorithm: https://ccrma.stanford.edu/~jos/pasp/Extended_Karplus_Strong_Algorithm.html, and Two-pole filters: https://ccrma.stanford.edu/~jos/filters/Two_Pole.html
- Klippel, AN 24, Measuring telecommunication drivers (micro-speakers resonate near 800 Hz): https://www.klippel.de/fileadmin/klippel/Files/Know_How/Application_Notes/AN_24_Telecomm_Driver.pdf
- ITU-R BS.1770 (K-weighting): https://www.itu.int/rec/R-REC-BS.1770
- EBU R 128 and Tech 3341 (loudness tolerance and meter windows): https://tech.ebu.ch/publications/r128, https://tech.ebu.ch/publications/tech3341
- Andy Farnell, Designing Sound (fire, crackle, bubbles): https://mitpress.mit.edu/9780262014410/designing-sound/
- Paul Adenot, Web Audio performance notes: https://padenot.github.io/web-audio-perf/
- W3C, Web Audio API: https://webaudio.github.io/web-audio-api/
- ZzFX (https://github.com/KilledByAPixel/ZzFX) and MDN, Web Audio best practices (https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices): a sound as a small set of numbers
