import type { Config } from "../config.ts";
import type { SarvamTransport } from "./api.ts";
import { createLiveTransport } from "./live.ts";
import { createRecordedTransport, savedRecordings } from "./recorded.ts";

export function createSarvam(
  config: Pick<Config, "SARVAM_MODE" | "SARVAM_API_KEY" | "SARVAM_BASE_URL">,
  { fetch: send }: { fetch?: typeof fetch } = {},
): SarvamTransport {
  if (config.SARVAM_MODE === "recorded") {
    return createRecordedTransport(savedRecordings());
  }
  if (config.SARVAM_API_KEY === undefined) {
    throw new Error("SARVAM_MODE is live, so SARVAM_API_KEY must be set.");
  }
  return createLiveTransport({
    baseUrl: config.SARVAM_BASE_URL,
    apiKey: config.SARVAM_API_KEY,
    fetch: send,
  });
}
