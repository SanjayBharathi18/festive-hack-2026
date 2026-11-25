---
title: Sarvam
purpose: Verified facts about the Sarvam AI APIs that the build uses.
read-when: You call a Sarvam API, change cfg_sarvam, handle a Sarvam error, or plan Sarvam credit.
owns: Sarvam access, models, request rules, limits, prices, errors
---

# Sarvam

Sarvam AI gives speech, translation, transliteration and language models for Indian languages. One API key and one credit balance give access to all products.

## Access

- Make the key as README.md ("Plug in the services") says.
- Auth header: `api-subscription-key: <key>` or `Authorization: Bearer <key>`. The build sends `api-subscription-key`.
- Only the backend calls Sarvam. The API accepts browser calls, but then the key is public.
- SDK: `sarvamai` on npm (camelCase methods, for example `speechToText.transcribe`). We call the REST API with `fetch`.
- Docs for agents: https://docs.sarvam.ai/llms.txt. Add `.md` to a docs page URL to get Markdown. MCP server: `claude mcp add sarvam-docs --transport http https://docs.sarvam.ai/_mcp/server`.

## Speech to text (Saaras)

- Model `saaras:v4` (the default). Modes: `transcribe`, `translate` (to English only), `verbatim`, `translit` and `codemix`.
- It covers 22 Indian languages and English.
- Language: leave `language_code` out (or send `unknown`). Then the answer has the detected `language_code` and `language_probability`. If you send a code, the probability is null.
- REST: 30 seconds of audio at most for each request. Longer audio gives a 400.
- Send a real WAV file with the content type `audio/wav`. Raw PCM needs `input_audio_codec`. Stereo audio is merged to mono.
- `keyterms`: up to 50 terms of up to 64 characters each, as a JSON array in one multipart field. Recognition favours these words. It does not guarantee them.
- Timestamps come back only with `with_timestamps=true`. They are for chunks, not for words.
- Batch: 2 hours for each file, 20 files for each job, speaker diarization up to 20 speakers. Real time: `/speech-to-text-realtime/ws`. We use neither.
- Billing: by the second, ₹0.49 for each minute.

## Chat model (sarvam-105b)

- OpenAI-compatible base URL: `https://api.sarvam.ai/v2`. The model is also served on `/v1/chat/completions`, which the build calls.
- 128K context, tool calls, structured output and streaming. It covers 10 Indian languages and English.
- Structured output: `response_format` with `json_schema` or `json_object`. `strict` is false by default: send `"strict": true`. The JSON comes back as a string in `message.content`.
- Reasoning is on by default. The docs give two default levels, `low` and `medium`, so always set it.
  - To turn reasoning off, send `"reasoning_effort": null`. If you leave the field out, reasoning stays on. The string `"none"` does not work for this model.
  - Reasoning tokens count toward `max_tokens` and are billed as output.
  - If reasoning uses up a small `max_tokens`, the answer has `finish_reason: "length"` and an empty `content`.
- Always send `max_tokens`. The maximum depends on the plan: Starter (pay as you go) 4,096, Pro 16,384, Business 128,000.
- The model serves the Sarvam-105B-1711 weights.
- Price: ₹10 for each 1M input tokens and ₹25 for each 1M output tokens. Cached input tokens: ₹0.25 for each 1M.

## Prism (sarvam-prism, not used)

- This build does not call Prism. Reviews, with the Prism check for abuse, are on the roadmap (README.md, "Roadmap").
- `POST /v2/systemone`. It gives calibrated probabilities. Question types: `noul` (yes or no), `choice` and `score`. No streaming.
- A request stops after 60 s. Sending `temperature` or `max_tokens` gives a 422.
- Confidence is lower for Indian languages. At a threshold of 0.9, about 68% of English answers pass, but only about 38% of answers in Indian languages. Plan a fallback for answers below the threshold.
- Price: ₹4 for each 1M input tokens. Output is free.

## Translation

| Model | Languages | Source language | Modes | Characters for each request |
|---|---|---|---|---|
| `mayura:v1` | 11, including Kannada, Hindi and English | `auto` allowed | formal, modern-colloquial, classic-colloquial, code-mixed | 1,000 |
| `sarvam-translate:v1` | 23 | Must be sent (no `auto`) | formal only | 2,000 |

- The docs present `mayura:v1` for conversational and code-mixed text.
- Saaras `mode=translate` gives English directly from audio, with no extra call.
- Price: ₹2 for each 1,000 characters.

## Transliteration

- 11 languages. `auto` is allowed as the source. For Latin script, use `target_language_code: en-IN`.
- 1,000 characters for each request. ₹2 for each 1,000 characters.
- The docs show Indian script to Latin and Latin to Indian script. They do not show one Indian script to another, for example Kannada to Devanagari.

## Language identification

`/text-lid` gives the language and the script of a text. It covers 11 languages. The input is 1,000 characters at most. Price: ₹0.35 for each 1,000 characters (Sarvam pricing page).

## Dictate (not used)

`POST /v2/dictate` runs Saaras v4 and Sarvam 105B in one call, with a `vocabulary` (up to 1,000 names) and `output_rules`. It returns the raw `transcript` and the finished `text`. We do not use it, because our flags choose the reading path between the two steps.

## Credit and limits

- A new verified account gets ₹100 of free credit. Credit does not expire.
- Pay-as-you-go rate limits: 60 requests each minute for speech to text, text to speech and `sarvam-105b`; 20 real-time streams at the same time. Transliteration also allows 60 requests each minute.
- The limits apply to the whole account: one token bucket for all keys.
- A fast burst of new WebSocket connections gets a rejection (close code 1003).

## Errors

| Status | Meaning | Retry |
|---|---|---|
| 400, 422 | Bad request | No |
| 402 `insufficient_quota_error` | The credit balance is empty | No |
| 403 | Missing or invalid key, or the request is not allowed. Check `error.code` | No |
| 429 `rate_limit_exceeded_error`, `model_rate_limit_exceeded_error`, `audio_duration_busy_error` | Rate limit | Yes. Obey `Retry-After` |
| 429 `seat_budget_exhausted_error` | The budget is used up. Add credit | No |
| 500, 502, 503 | Server error. A 503 can also carry `rate_limit_exceeded_error` | Yes |

## Billed units

- Speech to text, translation and transliteration answers have no usage field. Our code counts audio seconds for speech to text, and input characters for translation, transliteration and language identification.
- Chat answers have `usage`. Reasoning tokens are inside `completion_tokens`. `prompt_tokens_details.cached_tokens` shows cached input.
- Prism answers have `usage.input_tokens`.

## Not used

Bulbul (text to speech) and Sarvam Vision (documents).

## Links

- Docs index: https://docs.sarvam.ai/llms.txt
- Speech to text: https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/overview
- Keyterms: https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/how-to/keyterms
- Chat completions: https://docs.sarvam.ai/api/token-factory/chat-completions
- sarvam-105b: https://docs.sarvam.ai/api/token-factory/models/sarvam-105b
- Prism: https://docs.sarvam.ai/api/token-factory/models/sarvam-prism
- Translation: https://docs.sarvam.ai/api-reference/text/translate-text
- Transliteration: https://docs.sarvam.ai/api-reference/text/transliterate-text
- Errors: https://docs.sarvam.ai/api/getting-started/errors-troubleshooting
- Pricing and limits: https://docs.sarvam.ai/api/getting-started/pricing
- Authentication: https://docs.sarvam.ai/api-reference/authentication
