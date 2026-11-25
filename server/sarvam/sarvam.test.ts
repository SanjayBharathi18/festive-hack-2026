import assert from "node:assert/strict";
import { test } from "node:test";
import type { SarvamRequest } from "./api.ts";
import { createSarvam } from "./sarvam.ts";

const request: SarvamRequest = {
  api: "language_id",
  model: "text-lid",
  input: "ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ",
  body: { input: "ಎರಡು ಕೆಜಿ ಕಾಜು ಕಟ್ಲಿ" },
};

function countingFetch() {
  const urls: string[] = [];
  const send = (async (input: string | URL | Request) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return Response.json({ language_code: "kn-IN" });
  }) as typeof fetch;
  return { send, urls };
}

test("recorded mode never calls Sarvam, also with a key set", async () => {
  const { send, urls } = countingFetch();
  const sarvam = createSarvam(
    {
      SARVAM_MODE: "recorded",
      SARVAM_API_KEY: "sk_live_key_that_must_not_be_used",
      SARVAM_BASE_URL: "https://api.sarvam.test",
    },
    { fetch: send },
  );
  assert.equal(sarvam.mode, "recorded");
  await sarvam.send(request);
  await sarvam.send({ ...request, input: "a text with no saved answer" });
  assert.deepEqual(urls, []);
});

test("live mode calls the base URL with the given fetch", async () => {
  const { send, urls } = countingFetch();
  const sarvam = createSarvam(
    {
      SARVAM_MODE: "live",
      SARVAM_API_KEY: "sk_test",
      SARVAM_BASE_URL: "https://api.sarvam.test",
    },
    { fetch: send },
  );
  assert.equal(sarvam.mode, "live");
  const answer = await sarvam.send(request);
  assert.equal(answer.ok, true);
  assert.deepEqual(urls, ["https://api.sarvam.test/text-lid"]);
});

test("live mode with no key does not start", () => {
  assert.throws(
    () =>
      createSarvam({
        SARVAM_MODE: "live",
        SARVAM_API_KEY: undefined,
        SARVAM_BASE_URL: "https://api.sarvam.ai",
      }),
    /SARVAM_API_KEY must be set/,
  );
});
