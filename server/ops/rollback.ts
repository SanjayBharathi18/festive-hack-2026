import type { Config } from "../config.ts";
import { fetchWithRetry } from "../outbound/retry.ts";

export type RollbackSettings = {
  adminUrl: string;
  orgKey: string;
  environmentKey: string;
  featureId: number;
  segmentId: number;
};

export type RollbackResult =
  { ok: true } | { ok: false; status: number | null };

export const defaultAdminUrl = "https://api.flagsmith.com/api/v1/";
export const rollbackTimeoutMs = 10_000;

// The change of nudgebee/rollback-lang-kn.yaml, for a server whose flags come
// from Flagsmith and that has the organisation key and the ids that
// scripts/flagsmith-setup.ts prints. Otherwise the change stays in memory.
export function rollbackSettings(
  config: Pick<
    Config,
    | "FLAGSMITH_ENVIRONMENT_KEY"
    | "FLAGSMITH_ADMIN_API_URL"
    | "FLAGSMITH_ORG_API_KEY"
    | "FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY"
    | "FLAGSMITH_OPS_READING_FEATURE_ID"
    | "FLAGSMITH_LANG_KN_SEGMENT_ID"
  >,
): RollbackSettings | undefined {
  const {
    FLAGSMITH_ENVIRONMENT_KEY: flagsKey,
    FLAGSMITH_ORG_API_KEY: orgKey,
    FLAGSMITH_ROLLBACK_ENVIRONMENT_KEY: environmentKey,
    FLAGSMITH_OPS_READING_FEATURE_ID: featureId,
    FLAGSMITH_LANG_KN_SEGMENT_ID: segmentId,
  } = config;
  if (
    flagsKey === undefined ||
    orgKey === undefined ||
    environmentKey === undefined ||
    featureId === undefined ||
    segmentId === undefined
  ) {
    return undefined;
  }
  return {
    adminUrl: config.FLAGSMITH_ADMIN_API_URL ?? defaultAdminUrl,
    orgKey,
    environmentKey,
    featureId,
    segmentId,
  };
}

export function rollbackRequest({
  adminUrl,
  orgKey,
  environmentKey,
  featureId,
  segmentId,
}: RollbackSettings): { url: string; init: RequestInit } {
  const base = adminUrl.endsWith("/") ? adminUrl : `${adminUrl}/`;
  return {
    url: new URL(
      `../__future__/environments/${encodeURIComponent(environmentKey)}/features/${featureId}/`,
      base,
    ).href,
    init: {
      method: "PATCH",
      headers: {
        Authorization: `Api-Key ${orgKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        segment_overrides: [
          {
            segment: { id: segmentId },
            value: { type: "string", value: "safe" },
          },
        ],
      }),
    },
  };
}

export async function sendRollback(
  settings: RollbackSettings,
  {
    fetch: send = fetch,
    signal,
    baseDelayMs,
  }: {
    fetch?: typeof fetch;
    signal?: AbortSignal | undefined;
    baseDelayMs?: number;
  } = {},
): Promise<RollbackResult> {
  const { url, init } = rollbackRequest(settings);
  try {
    const response = await fetchWithRetry(url, init, {
      timeoutMs: rollbackTimeoutMs,
      signal,
      fetch: send,
      ...(baseDelayMs === undefined ? {} : { baseDelayMs }),
    });
    await response.body?.cancel();
    return response.ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: null };
  }
}
