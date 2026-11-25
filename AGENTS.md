---
title: AGENTS
purpose: Rules for coding agents in this repo, and the map of the context files.
read-when: Always.
owns: agent rules, stack, context map
---

# AGENTS

Obey these rules in each task.

## Context map

Read a file only when the task needs it. The frontmatter of each file names the facts that it owns. A fact lives in one file only; other files point to it.

| Task | File |
|---|---|
| Terms, users, user flows, product rules, product scope | `docs/concept.md` |
| Job of each of the three services, connections between them | `docs/integration.md` |
| Architecture, data, API, pipeline, flags, metrics, deploy | `docs/system.md` |
| Demo stores, menus, voice lines | `docs/demo-data.md` |
| Flagsmith facts | `docs/flagsmith.md` |
| NudgeBee facts | `docs/nudgebee.md` |
| Sarvam facts | `docs/sarvam.md` |
| Reasons, budgets and sources behind the rules | `docs/practices.md` |
| Design direction, colour, icons, motion, copy style, references | `docs/design.md` |
| Sound: needs, roles, family rules, palette, synthesis, engine, tests | `docs/sound.md` |
| Design rounds: swatch method and prompts | `extra/README.md` |
| Run, keys and service setup, deploy steps, roadmap, credits | `README.md` |

## Hard rules

1. The product uses Flagsmith, NudgeBee and Sarvam AI. Each tool must do real work (see `docs/integration.md`).
2. Disclose AI use in the README section "How we used AI". A team member must be able to explain each line.
3. Keep the licence notice of third-party code. Credit the code in the README.

## Product

1. The docs describe the product as built. Do not build what the docs do not describe. Features that are not built are in `README.md` ("Roadmap").
2. After each change, the deployed app must work end to end.
3. The AI never speaks as the user. Show what the model understood. The user confirms or edits it.
4. Each AI feature has a non-AI fallback behind an `ops_` flag.
5. Recorded mode shows the "Recorded" badge. Never show recorded output as live output.
6. Prototype parts (`docs/system.md`, "Prototype parts") show the "Prototype" badge. Never show a simulated message or payment as real.

## UX

1. Always show the system status. Use the words of the user.
2. Give undo, not "are you sure?". Prevent errors before you explain them.
3. Give one primary action on each screen. Each error message tells the user what to do next.
4. Save optimistically. Correct the screen when the server replies. Never block recording or typing on the network.
5. Test each change in a laptop browser, at 1280 px and at 1440 px wide.

## Stack

Change these defaults before the build starts, not during the build.

1. Frontend: Vite and TypeScript, no UI framework. A laptop web app with no app-store install and no passwords. This build is a laptop website; phone layouts are on the roadmap.
2. Backend: one Node.js and TypeScript service (Hono). It serves the frontend, calls Sarvam, evaluates Flagsmith flags and exposes `/metrics`.
3. Storage: SQLite on a persistent volume, one replica.
4. Deploy: one container from the `Dockerfile`, with HTTPS. The live app runs on Railway. The manifests in `deploy/` run the same image on k3s on one VM, which a NudgeBee tenant needs (`docs/system.md`, "Deployment").

## HTML

1. Use semantic HTML. If the UI is known before run time, write it in HTML, not in JavaScript.
2. Use native elements (`<dialog>`, `<form>` validation, `<details>`, `<input type="file" accept="audio/*">`). Do not write your own versions.
3. Each control works with a keyboard and has an accessible name.

## TypeScript

1. Use modern syntax and strict mode. Put general logic first and pure functions last.
2. Use clear names. Do not write comments, except for code that is not obvious. Do not write section divider comments.
3. Validate each external input at the boundary (request bodies, LLM output, webhooks) with one zod schema for each shape. Put shared types in `shared/`.

## Styling

1. Use modern CSS: custom properties for all tokens, nesting, grid and flexbox. Use system default styles where possible.
2. Use high contrast. Take colours only from the palette in `docs/design.md` ("Colour and theme"). Each colour has one job.
3. Use one type scale and one spacing unit. Body text is 16 px or more. Tap targets are 44 px or more.
4. Fonts must show Indian scripts. Use Anek for words and IBM Plex Mono for numbers (`docs/design.md`, "Rules for the look"). Use tabular numbers for quantities and money.
5. Motion uses duration tokens. Stop motion when `prefers-reduced-motion` is set.

## Sound

1. Sound is feedback, never control. If a sound fails, log the error and continue the action.
2. Make short sounds with the Web Audio API. Do not use audio files. Render drum, string and metal sounds into buffers once, then play each sound as one source.
3. Resume the audio context on the first `pointerup`, `touchend`, `click` or `keydown`. A touch `pointerdown` does not allow audio.
4. Use the one sound family in `docs/sound.md`: one raag, one room, one master bus, the loudness tiers, one positive ending and one negative fall. Code plays roles, never raw sounds.
5. Frequent background work is silent. Sound is on by default. One toggle controls sound and vibration. Keep its state in localStorage.
6. Play no sound while the microphone is open. Stop the microphone tracks as soon as recording ends. Do not set the audio session type to "playback".

## Code organisation

1. The `main.ts` of each page is a composition. It queries the DOM, makes the modules and connects their events. Put state machines, algorithms and async flows in modules.
2. Use one module for each concern and one folder for each feature. Give each file the name of its concern.
3. Use composition. Export a factory function that keeps its state in a closure and returns a small object, or export a plain function. Do not use classes or inheritance.
4. Make a seam only where implementations really differ (for example, Sarvam live and Sarvam recorded). Pass the seam in as an argument.
5. Do not write simple wrappers. An abstraction must own state or logic. If it only renames or forwards a call, call the function directly.
6. Extract shared code at the second real use, not before.
7. Async work accepts an `AbortSignal`. Then you can cancel it, and live and recorded sources stay interchangeable.

## Backend

1. Each outbound call has a timeout. Retry only on 429, 500, 502 and 503, with exponential backoff and jitter, 3 tries maximum. Obey `Retry-After`. Then use the fallback. A Sarvam 402, or a Sarvam 429 with `seat_budget_exhausted_error`, means no credit: do not retry it.
2. Each create request has an idempotency key. A retry must not make a duplicate record.
3. Get configuration and secrets from environment variables. Do not log a secret, commit it or send it to the browser.
4. Give `/healthz` for liveness and `/readyz` for readiness. On SIGTERM, stop new requests, complete the current requests, then exit.
5. Write one JSON log line for each request, with a request ID and the flag variants used.

## The three services

1. Flagsmith: evaluate flags on the server and send the results to the page. The browser never polls Flagsmith. Each flag has a default value in code. Flag names start with their kind: `ops_` (kill switch), `exp_` (experiment), `cfg_` (remote config).
2. Each experiment has one question, one metric and one stated identity unit. Do not change the weights while it runs.
3. Sarvam: only the backend calls it. Record the model, language, latency, result and billed units of each call as metrics. Dev scripts that use the `.env` key add each call to the git-ignored `usage.log`, with running totals at the top. The server does not write `usage.log`.
4. Sarvam credit: use recorded mode for development and tests. Use live calls only for learning tests, fixture recording, incident rehearsals, the experiment and the live app.
5. NudgeBee: metric names obey Prometheus rules (`snake_case`, `_seconds`, `_total`). Labels have few values (route, model, language, outcome, variant), never user IDs. Alert rules are PrometheusRules in `deploy/`. A workflow that changes a flag has an approval step, makes the change only after "approve", and changes only `ops_` flags.

## Kubernetes

1. Manifests are in `deploy/`. One command applies them. Do not write our own Helm chart.
2. The Deployment sets resource requests and limits, liveness and readiness probes, and mounts the SQLite volume.
3. Tag images with the git SHA, never `latest`.

## Workflow

1. Make small commits on `main` with Conventional Commit messages. Deploy after each working step.
2. Run `npm run format` (Prettier), `npm run check` (tsc) and `npm test` before you report back or commit. Each module with logic has a test suite (`docs/system.md`, "Tests").
3. The shell is zsh. Quote globs (for example, `--include="*.ts"`) and put bash-only syntax in `bash -c`.
4. Give a reason for each new dependency. Use the platform first.

## Design process

1. Before you build screens, explore style, components, icons and sound as swatch pages in `extra/`. See `extra/README.md`.
2. After the team selects a direction, follow `extra/README.md` ("After the selection").
