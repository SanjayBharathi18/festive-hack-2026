---
title: Practices
purpose: The reasons, budgets and sources behind the rules in AGENTS.md.
read-when: You need the reason for a rule, a speed budget or an accessibility target.
owns: reasons for the rules, speed budgets, accessibility targets, sources
---

# Practices

The rules are in `AGENTS.md`. This file gives the reasons, the numbers and the sources.

## Reasons

| Reason | Rules | Source |
|---|---|---|
| Boring technology lowers risk: one language end to end, the platform first, and tools that the team knows. | Stack, Workflow 4 | [boring] |
| Complexity is the main risk to a build. Small steps that end deployed keep the app working. | Product 1 and 2, Workflow 1 | [grug] |
| A seam lets live and recorded sources swap where implementations really differ. | Code organisation 4 and 7 | [spaceship] |
| A feature that degrades does not fail the user. | Product 4, The three services 1 and 2 | [toggles] |
| Backoff with jitter stops retries from overloading a service. | Backend 1 | [backoff] |
| An idempotency key makes a retry safe. | Backend 2 | [idempotency] |
| Probes let Kubernetes restart and route correctly. | Backend 4, Kubernetes 2 | [probes] |
| Rate, errors and duration show the health of each route and each call. | The three services 3 and 5 | [sre] |
| Standard metric names and few label values keep queries correct and cheap. | The three services 5 | [prom] |
| Configuration in the environment keeps secrets out of the code. | Backend 3 | [12factor] |
| A check at each boundary stops injection and bad data. | Backend 3, TypeScript 3 | [owasp] |
| Usability heuristics: status, user words, undo, error prevention. | UX 1 to 3 | [heuristics] |
| Small JavaScript is the cheapest speed gain on a mid-range phone. | Stack 1 | [cwv] |
| A buffer source is cheap to play. A live Karplus-Strong loop in Web Audio cannot go above about 375 Hz, because a delay inside a loop is at least 128 frames. | Sound 2 | [webaudio], [adenot] |
| A browser allows audio only after a user activation, and a touch counts only when the finger lifts. | Sound 3 | [activation] |
| Sounds that share one key, a few timbres with fixed meanings, one room and one loudness ladder are heard as one set. Listeners turn off raw everyday sounds that they hear many times a day. One shared ending for each outcome makes "it worked" and "it did not" easy to tell apart; upward motion reads as positive. | Sound 4 | [earcons], [sonification], [material-sound] |
| An iPhone page that plays only Web Audio gets the ambient category: the Ring/Silent switch and the screen lock silence it, and other apps keep playing. A playback session would stop the cook's music. Capture switches the session to play-and-record, so a sound during a recording goes into the recording. | Sound 6 | [webkit-audio], [apple-ambient] |
| Clear commit messages keep the history readable. | Workflow 1 | [cc] |

## Speed budgets

| Item | Budget | Source |
|---|---|---|
| Feedback after a tap | Less than 100 ms | [nielsen-rt] |
| A wait that keeps the user's flow of thought | Less than 1 s | [nielsen-rt] |
| A wait that keeps the user's attention | Less than 10 s. For longer waits, show the progress or the time left | [nielsen-rt] |
| Largest Contentful Paint | 2.5 s or less on a mid-range phone | [cwv] |
| Interaction to Next Paint | 200 ms or less | [cwv] |
| Cumulative Layout Shift | 0.1 or less | [cwv] |

Web Vitals count at the 75th percentile of visits.

## Accessibility targets

| Target | Value | Source |
|---|---|---|
| Text contrast | 4.5:1 or more (WCAG 2.2, 1.4.3, level AA) | [wcag] |
| Target size | 24 px or more (WCAG 2.2, 2.5.8, level AA). Styling 3 sets 44 px | [wcag] |

## Sources

- [boring] Dan McKinley, Choose Boring Technology: https://boringtechnology.club
- [grug] The Grug Brained Developer: https://grugbrain.dev
- [spaceship] Chuanqi Sun, Spaceship: https://github.com/chuanqisun/spaceship
- [nielsen-rt] Nielsen, Response Times: The 3 Important Limits: https://www.nngroup.com/articles/response-times-3-important-limits/
- [cwv] web.dev, Web Vitals: https://web.dev/articles/vitals
- [backoff] AWS Architecture Blog, Exponential Backoff and Jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- [idempotency] Stripe, Idempotent requests: https://docs.stripe.com/api/idempotent_requests
- [toggles] Pete Hodgson, Feature Toggles: https://martinfowler.com/articles/feature-toggles.html
- [probes] Kubernetes, Liveness, readiness and startup probes: https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
- [sre] Google SRE Book, Monitoring Distributed Systems: https://sre.google/sre-book/monitoring-distributed-systems/
- [prom] Prometheus, Metric and label naming: https://prometheus.io/docs/practices/naming/
- [12factor] The Twelve-Factor App, Config: https://12factor.net/config
- [owasp] OWASP Top 10: https://owasp.org/www-project-top-ten/
- [heuristics] Nielsen, 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- [wcag] W3C, WCAG 2.2: https://www.w3.org/TR/WCAG22/
- [cc] Conventional Commits: https://www.conventionalcommits.org
- [webaudio] W3C, Web Audio API: https://webaudio.github.io/web-audio-api/
- [adenot] Paul Adenot, Web Audio performance notes: https://padenot.github.io/web-audio-perf/
- [activation] WHATWG HTML, User activation: https://html.spec.whatwg.org/multipage/interaction.html
- [earcons] Brewster, Wright and Edwards, Experimentally derived guidelines for the creation of earcons: https://www.dcs.gla.ac.uk/~stephen/papers/HCI95.pdf
- [sonification] The Sonification Handbook, chapter 14, Earcons: https://sonification.de/handbook/download/TheSonificationHandbook-chapter14.pdf
- [material-sound] Material Design, Sound attributes: https://m2.material.io/design/sound/sound-attributes.html
- [webkit-audio] WebKit, MediaSessionManagerCocoa.mm: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/cocoa/MediaSessionManagerCocoa.mm
- [apple-ambient] Apple, AVAudioSession.Category.ambient: https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient
