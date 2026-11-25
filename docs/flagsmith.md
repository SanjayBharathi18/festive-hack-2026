---
title: Flagsmith
purpose: Verified facts about Flagsmith that the build uses.
read-when: You evaluate flags, record experiment events, change a flag by API, or set up the experiment or the webhook.
owns: Flagsmith concepts, Node SDK behaviour, management API, experiments, webhooks, plans and limits
---

# Flagsmith

Flagsmith decides which features are on, and which values they have, for each environment and each identity, with no new deployment. It also runs A/B experiments on its flags (beta).

## Concepts

- Flag: an on/off state and an optional value (string, number, boolean or JSON). JSON is stored and returned as a string. A string value is 20,000 bytes at most.
- Multivariate flag: a control value and one or more variations with weights. Each identity gets one variation and keeps it, in each environment. A change of the weights moves identities to other variations.
- Identity and traits: an identity is one user or one unit. Traits are data about it.
- Segment: a group of identities. Rules on traits decide the members. Operators include equal, contains, regex, semver, in and a percentage split. All operators are case-sensitive: a trait matches only if it equals the rule value exactly.
- Override: a segment override changes a flag for one segment. An identity override changes it for one identity. An identity override has priority over a segment override. If an identity is in more than one segment, the override with the lowest priority number wins.
- Webhook: an environment webhook sends `FLAG_UPDATED` when a flag state changes, also for a segment override.
  - It takes a URL and an optional secret, but no custom headers.
  - With a secret, the `X-Flagsmith-Signature` header is a hex HMAC-SHA256 of the raw body.
  - The payload has `event_type`, `data.changed_by`, `data.new_state` and `data.previous_state` (with `feature.name`, `feature_segment` and `feature_state_value`).

## Node SDK

- Package `@flagsmith/nodejs`. Experiments need version 9.1.0 or later. Version 9.4.0 adds `close(timeoutMs)`, event retries and a buffer of 1,000 events. The build uses 9.5.0. The old `flagsmith-nodejs` package cannot send experiment events.
- Make the client with the server-side environment key, `enableEvents` on, and a `defaultFlagHandler`.
- Defaults: `requestTimeoutSeconds: 10` and `retries: 3`. Retries happen only on network errors and timeouts, with a fixed 1 s delay and no jitter. Any non-200 answer throws, and the default flag handler gives the values.
- The SDK takes no `AbortSignal`. It accepts a custom `fetch`.
- `getIdentityFlags(identifier, traits)`: in remote evaluation, one billable `/identities` request. It saves the traits. Send all traits on each call.
- Local evaluation evaluates identity flags in the process, from the traits that you pass. It polls the environment document (default every 60 s). Each poll is billable. The docs say that experiments need remote evaluation.
- Remote answers do not name the segment.
- Values come back as `string | number | boolean | null`.

Experiment calls:

- `await getExperimentFlag(flagName, identifier, traits?)` calls `getIdentityFlags`, so it makes its own `/identities` request. It returns the whole flag: `value`, `enabled`, `variant` and `experiment.inExperiment`. It records an exposure only if the flag is enabled, the identity is in the rollout, and the flag has a variant. It throws if `enableEvents` is off. Use `flag.value` for the branch. `flag.variant` is the variation key. The control has the key `control`.
- In 9.5.0, each flag from `getIdentityFlags` carries `variant` and `experiment` (`id`, `name`, `inExperiment`). The SDK reads them from `metadata.experiment` in the answer. So one `getIdentityFlags` call gives both the values and the experiment state. `getExperimentFlag` reads the same fields.
- `trackExposureEvent(flagName, { identifier, value?, traits?, metadata? })` records an exposure for a flag that you read with `getIdentityFlags`. `getExperimentFlag` sends `value: flag.variant` and `metadata: { experiment_id }`. The build makes one `getIdentityFlags` call for each order and sends the same exposure (`server/flags/flagsmith-flags.ts`).
- `trackEvent(eventName, { identifier, value?, traits?, metadata? })` records a conversion. It throws if events are off or if the name starts with `$`. Event names are case-sensitive.
- The SDK sends events in batches every 10 s (`flushInterval`). Exposures count once for each identity.
- On shutdown, `await flagsmith.close(timeoutMs)`. Without it, buffered events are lost.

## Management API

- Endpoint: `https://api.flagsmith.com/api/__future__/environments/{environment_key}/features/{feature_id}/`. `feature_id` is the numeric ID.
- Header: `Authorization: Api-Key {organisation_api_key}`. To make the key, see README.md ("Plug in the services").
- Turn a flag on or off: `PATCH` with `{"environment_default": {"enabled": true}}`.
- A value has a type and a string: `{"type": "string", "value": "safe"}`. Types: string, integer, boolean. Each value is sent as a string, for example `"42"` or `"true"`.
- Segment override: `PATCH` with `{"segment_overrides": [{"segment": {"id": 12}, "value": {"type": "string", "value": "safe"}}]}`. An existing override keeps its priority. Two overrides cannot have the same priority. The 200 answer is the full flag state.
- Remove one segment override: `DELETE .../features/{feature_id}/segment-overrides/{segment_id}/`. It returns 404 if there is no override.
- Variant weights: send `variants` with the `id` and `weight` of each variant. Include all variants.
- Limit: 500 requests each minute. These requests do not count toward the plan quota.
- These `__future__` endpoints are experimental. They do not change flags when change requests are on. They cannot set identity overrides. The stable v1 API can also change an override (`PATCH /api/v1/features/featurestates/{id}/`, after a lookup of the id).
- Setup with the v1 API (`scripts/flagsmith-setup.ts`): variation keys cannot be set in the body that creates a feature, so the script adds them after. A metric attaches to an experiment by its integer id. The project setting `prevent_flag_defaults` can leave a new flag blank, so the script sets each default.
- The CLI (`flagsmith flag update`) calls the same `__future__` endpoints. The MCP server changes flags, segments and overrides, and it creates experiments, but it cannot start or end an experiment.

## Experiments

Setup:

1. Turn on the warehouse: Environment Settings, Warehouse, Flagsmith, Enable. Do this first. Events are rejected without it, and the first event can take hours to show. The managed warehouse works on the Free plan. Your own warehouse needs Scale-Up.
2. Make a multivariate flag. Its own value is the control. Each variation needs a key ("label").
3. Make a metric from an event. Aggregations: Occurrence, Count, Sum, Mean.
4. Make the experiment: the flag, the rollout, the split and the primary metric. In the dashboard it starts at once. Through the API, it starts with `POST .../experiments/{id}/start/`.
5. Add the exposure and conversion calls to the app.

Results:

- They show lift, a 95% credible interval, the chance to be best, and a warning if the split is wrong.
- A variation shows "Collecting data" while it has fewer than 50 identities, or fewer than 5 conversions for an occurrence metric.
- A conversion counts only after the first exposure of the same identifier. An identity that saw two variations is set aside. Events older than 10 days are rejected.
- Results are computed when you touch **Refresh results** (or `POST .../results/refresh/`), at most once every 5 minutes.
- The flag is locked while the experiment runs. The rollout stays editable. Ending the experiment unlocks the flag. An ended experiment cannot start again.

## Feature health

Feature Health (beta) marks a feature unhealthy from Prometheus Alertmanager, Grafana or webhook alerts. It does not change the flag. The automatic switch-off is the "Abort if unhealthy in this environment" option of a Release Pipeline stage (a closed beta). It turns the flag off for everyone. It cannot set a segment override to another value.

## Plans and limits

| Plan | Requests each month | Team members | Notes |
|---|---|---|---|
| Free | 50,000 | 1 | 1 project. 100,000 users in experiments |
| Start-Up | 1,000,000 | 3 | 14-day free trial, then $45 a month ($40 a month billed yearly) |

- Over the quota, Flagsmith sends a warning email. It stops answering API requests 7 days later, unless you upgrade. The block ends 30 days after the first warning, or when you upgrade.
- Live push of flag changes is for Enterprise only. Do not poll from the browser.
- Change requests are for Scale-Up and Enterprise only.

## Links

- Docs: https://docs.flagsmith.com
- Run an experiment: https://docs.flagsmith.com/experimentation/run-an-experiment
- Analyse an experiment: https://docs.flagsmith.com/experimentation/analyse-an-experiment
- Set up with a coding agent: https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent
- Server-side SDKs: https://docs.flagsmith.com/integrating-with-flagsmith/sdks/server-side
- Update flags with the API: https://docs.flagsmith.com/managing-flags/updating-flags
- Environment settings and webhooks: https://docs.flagsmith.com/administration-and-security/platform-configuration/environment-settings
- Segments: https://docs.flagsmith.com/flagsmith-concepts/segments
- Feature health: https://docs.flagsmith.com/managing-flags/feature-health-metrics
- MCP server: https://docs.flagsmith.com/integrating-with-flagsmith/mcp-server
- Pricing: https://www.flagsmith.com/pricing
