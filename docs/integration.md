---
title: Integration
purpose: The job of each of the three services (Sarvam, Flagsmith and NudgeBee) in the product, and how they connect.
read-when: You work on a Sarvam, Flagsmith or NudgeBee feature, or on the developer console.
owns: service jobs, the three connections, other services, depth options, anti-patterns
---

# Integration

Use only these connections. Add a connection only if it is necessary and only that service can do the job. "Roadmap:" marks a job that this build does not have (README.md, "Roadmap").

## Job of each service

| Service | Job in the product |
|---|---|
| Sarvam | Changes speech into words and finds the language. Reads orders, carts and items. Finds dishes from a search in any language or script. Gives item names in English letters, and a store link for a store name in another script. Shows item names in the buyer's script. Translates board posts, quote requests and notes. Roadmap: suggests items, packs and categories, and checks reviews for abuse. |
| Flagsmith | Decides how to read each order, from its language. Tests two ways to read orders. Holds the switch for each fallback. |
| NudgeBee | Watches the app during the rush. Investigates each critical alert. After a person approves, changes one Flagsmith switch for the broken part only. |

The developer console on `/ops` shows the three services to the team, not to sellers or buyers: the Flagsmith flags, decisions and experiment, the NudgeBee incident and the Sarvam calls (`docs/system.md`, "Pages"). In this build, NudgeBee is simulated and labelled there (`docs/system.md`, "Prototype parts"). The alert rules in `deploy/prometheus-rules.yaml` and the workflow files in `nudgebee/` are real and ready for a tenant.

## The three connections

**Flagsmith → Sarvam.** Flags hold the Sarvam settings and the reading path for each language segment. An experiment compares native reading with translate-first reading. A flag switches one language to the safe path or to manual entry, or switches voice off. The flags are in `docs/system.md` ("Flags").

**Sarvam → NudgeBee.** The app counts each Sarvam call and each reading, by language and outcome: invalid answers, rate limits, no credit, latency. The critical alert on invalid readings starts a NudgeBee investigation. The other alerts are warnings. In this build, the console on `/ops` checks the condition of the critical alert in the same metrics, and starts the simulated investigation.

**NudgeBee → Flagsmith.** NudgeBee investigates the critical alert. After a person approves, a NudgeBee workflow changes `ops_reading` for one language segment. Flagsmith cannot switch one segment to a safe value by itself (`docs/flagsmith.md`, "Feature health"). NudgeBee does this job. In this build, **Approve** on `/ops` makes the same change as the workflow file.

## Each service is integral

- Without Sarvam: voice notes cannot enter the order book, search loses its matches across scripts, and the seller reads notes and requests only in the language of the writer.
- Without Flagsmith: there is no reading by language, no experiment, and nothing for NudgeBee to change.
- Without NudgeBee: the app works on a quiet day but breaks at the festive peak, and nobody knows until the sellers see it.

## Other services

These are not among the three services. Each one does a job that none of the three can do. Their status in this build is in `docs/system.md` ("Prototype parts").

| Service | Job |
|---|---|
| WhatsApp | Forwarded orders, codes and messages |
| Email | Codes for work email addresses |
| Payment gateway | Online payments and refunds |

## Depth options

1. The detected language puts each order in a language segment of Flagsmith.
2. A rollback changes only the affected segment. Users of other languages see no change.
3. Roadmap: flag changes show as NudgeBee events, through the Flagsmith webhook. This needs a NudgeBee tenant (README.md, "Plug in the services").

## Do not

- Sarvam: do not only translate fixed UI text, read a button aloud, or build a general chatbot that any LLM can replace.
- Flagsmith: do not use only one on/off flag that never changes. Do not run an experiment with no real users. The experiment uses real orders from the team, and README.md ("The experiment") says so.
- NudgeBee: do not show only "it is installed" and a dashboard. Do not stage a crash that is not related to the product. Do not use NudgeBee workflows as the business logic of the product.
