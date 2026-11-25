---
title: Design rounds
purpose: The swatch method and the prompts for the design rounds.
read-when: You run a design round, or you copy the selected tokens, icons and sounds into the app.
owns: swatch method, round prompts, steps after the selection
---

# Design rounds

The method comes from Spaceship (https://github.com/chuanqisun/spaceship, MIT). Its swatch pages are in the `extra/` folder of that repository. The agent makes several design options as standalone HTML pages. We compare them on a phone, select one, give feedback and do a new round.

Fill the placeholders from `docs/design.md` ("Inputs for the rounds"):

| Placeholder | Value |
|---|---|
| [product line] | The product line |
| [people] | The people in `docs/concept.md` ("Persona") |
| [directions] | The four directions for round 1 |
| [key components] | All key components |
| [component] | One key component |
| [style-N] | The selected style page |

## Rules for each swatch page

1. Each page is one standalone HTML file in `extra/`. A shared nav bar links all pages. The app's Vite build leaves this folder out.
2. All pages in one round have the same sections, so that you can compare the options.
3. A header paragraph gives the one idea of the page, and what changed from the last option. Example: "Kumkum means one thing only: it still needs her."
4. Each section has a number and a narrow label column on the left.
5. Each token shows its job next to it. Example: "red: serial and order numbers".
6. Each state sits in its own grid cell. Its caption gives the state and the exact spec. Example: "pressed: inset 2 px, 0 ms".
7. The frozen states and the live playground use the same render function. CSS reads state from data attributes.
8. Use real content: real names, quantities and prices in English, Hindi and Kannada. Do not use lorem ipsum.
9. Show all states: default, hover, focus, pressed, loading, success, error, empty and disabled.
10. In each new round, the last selection becomes option "a" and is preselected. Each new option changes one thing.
11. Select on a real phone. Select the option that is fastest to read, not the most beautiful. Stop when the time box ends.

## Round 1: style (20 minutes)

Done in another form: the team answered design questions in place of four style pages, then picked the type on `extra/type.html` and `extra/type-2.html`. The selection is in `docs/design.md`.

> Read AGENTS.md and docs/design.md. Make `extra/style-1.html` to `extra/style-4.html`, one page for each of the [directions], for [product line]. The users are [people]. Each page has a header paragraph with its one idea and five sections:
> 00. Names: three proposed product names.
> 01. Tokens: the palette with the job of each colour, a type scale with Hindi and Kannada samples, spacing, radius, motion durations.
> 02. Composition: the store page and the desk at 390 px wide, with real data.
> 03. Components: the [key components] in all states.
> 04. Motion: the page morph, the long motion and the pressed states.
> Change the palette, the density, light or dark, and how status shows. Add `extra/shared.css` with a nav bar that links all swatch pages.

## Round 2: components and icons (20 minutes each)

Icons done: `extra/icons.html` and `extra/icons-2.html`. The selection is in `docs/design.md` ("Icons"). The key components were decided in the same design questions. Run a component round only if the team wants one.

> Read AGENTS.md and the selected style, [style-N]. Make `extra/[component]-1.html` to `extra/[component]-3.html`: three ideas for [component]. Show each idea in all states, next to the states of the rest of the screen. Keep the selected tokens.

> Read AGENTS.md, docs/design.md ("Icons") and [style-N]. Make `extra/icons-1.html` to `extra/icons-3.html`: three styles for the whole icon set, as inline SVG in the selected palette. Show each icon at 24 px and 44 px, next to its word, in a button and in a list row.

## Round 3: sound (done)

The team picked one take for each role on `extra/soundboard.html`. The palette is in docs/sound.md ("Palette"). To tune a sound, the team plays the soundboard on laptop and phone speakers and runs the listening tests in docs/sound.md ("Tests"). Then:

> Read AGENTS.md ("Sound") and docs/sound.md. Apply the team's feedback to `extra/sound-synth.js`, the synthesis behind `extra/soundboard.html`. Keep the rules in docs/sound.md ("One family"). Add a changed sound as a new take next to the old one, and point `PICKS` at it. A new role gets a row in docs/sound.md ("Roles") and three takes. After each change, press **Run the checks** on the soundboard, and stop only when every sound passes. Update docs/sound.md ("Palette") to match.

The engine model comes from Spaceship (`src/text/sound/engine.ts` in that repository): each sound is a small object of numbers, with a voice cap, a limiter and one shared room.

## After the selection

- Copy the selected tokens into `src/styles/tokens.css`.
- Copy the selected icons into `src/icons/` as SVG files, then build the sprite (`docs/design.md`, "Icons").
- Copy the sound selections into `src/sound/sounds.ts`.
- Keep all swatch pages and `extra/sound-kits.html`. They are the record of the design process.
