import { z } from "zod";
import { presentVariables, type Env } from "../server/config.ts";
import {
  flagDefaults,
  languageSegments,
  variantKeys,
  type FlagName,
} from "../server/flags/decisions.ts";
import {
  conversionEvent,
  experimentFlag,
  flagKinds,
  flagNames,
  storedDefault,
} from "../server/flags/flag-values.ts";
import { fetchWithRetry } from "../server/outbound/retry.ts";

export type SetupOptions = {
  env: Env;
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};
export type RollbackValues = {
  environment: string;
  environmentKey: string;
  opsReadingFeatureId: number;
  langKnSegmentId: number;
};
export type SetupReport = {
  made: string[];
  found: string[];
  byHand: string[];
  rollback?: RollbackValues;
  failure?: string;
};
export type FlagState = z.infer<typeof flagStateSchema>;
export type WantedOverride = {
  segmentId: number;
  segment: string;
  enabled: boolean;
  value?: string;
};
export type StatePatch = {
  body: {
    environment_default?: {
      enabled?: boolean;
      value?: { type: "string"; value: string };
      variants?: { id: number; weight: number }[];
    };
    segment_overrides?: {
      segment: { id: number };
      enabled: boolean;
      priority: number;
      value?: { type: "string"; value: string };
    }[];
  };
  changes: string[];
};

type Settings = z.infer<typeof settingsSchema>;
type Api = ReturnType<typeof createApi>;
type Feature = { id: number; made: boolean };
type Environment = z.infer<typeof environmentSchema>;
type Rule = {
  rules?: Rule[] | undefined;
  conditions?: z.infer<typeof conditionSchema>[] | undefined;
};
type SegmentRule = {
  name: string;
  property: string;
  value: string;
  description: string;
};

const defaultApi = "https://api.flagsmith.com/api/v1/";
const dashboard = "https://app.flagsmith.com";
const variation = { value: "translate_first", weight: 0, split: 50 };
const failureMark = Symbol("setup failure");

const descriptions: Record<FlagName, string> = {
  ops_voice:
    "Kill switch, read from on/off. On: voice input. Off: no mic buttons; list, paste and type only.",
  ops_reading:
    "Kill switch, read from the value: ai, safe or manual, with an override for each language segment. NudgeBee sets safe for one language.",
  ops_suggestions:
    "Kill switch, read from the value: ai or off. Off: no suggestions, no item reading and no category pick.",
  ops_search:
    "Kill switch, read from the value: ai or plain. Plain: a substring match on the original names.",
  ops_transliteration:
    "Kill switch, read from the value: ai or off. Off: item names show in their original script.",
  ops_translation:
    "Kill switch, read from the value: ai or off. Off: the original text only.",
  ops_review_check:
    "Kill switch, read from the value: ai or wordlist. Wordlist: a fixed list of abusive words.",
  exp_reading_path:
    "Experiment for desk readings: native (control) or translate_first. The variation has weight 0, so every order is native until the experiment starts and sets the 50/50 split. Off: native for every order.",
  cfg_sarvam:
    "Remote config, read from the value: the Sarvam settings as JSON. A value that is not valid gives the safe setting.",
  cfg_demo_trace:
    "Remote config, read from on/off. On: a one-line trace on each order. The demo segment turns it on.",
};

const segments: SegmentRule[] = [
  ...Object.entries(languageSegments).map(([code, name]) => ({
    name,
    property: "language",
    value: code,
    description: `Orders that Sarvam read as ${code}: the trait language equals ${code}.`,
  })),
  {
    name: "demo",
    property: "is_demo",
    value: "true",
    description: "Orders of demo stores: the trait is_demo equals true.",
  },
];

const experiment = {
  name: "Reading path",
  hypothesis:
    "Does native reading need fewer corrections than translate-first reading? Identity: the order. Metric: occurrences of order_saved_unedited.",
};

const settingsSchema = z.object({
  FLAGSMITH_ORG_API_KEY: z.string(),
  FLAGSMITH_PROJECT_ID: z.coerce.number().int().positive().optional(),
  FLAGSMITH_LIVE_ENVIRONMENT: z.string().default("Production"),
  FLAGSMITH_ADMIN_API_URL: z.url({ protocol: /^https?$/ }).optional(),
  NUDGEBEE_FLAG_WEBHOOK_URL: z.url({ protocol: /^https$/ }).optional(),
});

const variableRules: Record<string, string> = {
  FLAGSMITH_PROJECT_ID:
    "must be the number of the project, from the dashboard address /project/<number>/",
  FLAGSMITH_LIVE_ENVIRONMENT: "must be the name of an environment",
  FLAGSMITH_ADMIN_API_URL: "must be an http or https URL",
  NUDGEBEE_FLAG_WEBHOOK_URL:
    "must be the https Automation Webhook URL of the NudgeBee flag-change workflow",
};

const pageSchema = z.object({
  next: z.string().nullish(),
  results: z.array(z.unknown()),
});
const projectSchema = z.object({ id: z.number().int(), name: z.string() });
const environmentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  api_key: z.string(),
});
const featureSchema = z.object({ id: z.number().int(), name: z.string() });
const optionSchema = z.object({
  id: z.number().int(),
  string_value: z.string().nullish(),
  key: z.string().nullish(),
});
const conditionSchema = z.object({
  operator: z.string(),
  property: z.string().nullish(),
  value: z.string().nullish(),
});
const ruleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.object({
    rules: z.array(ruleSchema).optional(),
    conditions: z.array(conditionSchema).optional(),
  }),
);
const segmentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  feature: z.number().int().nullish(),
  rules: z.array(ruleSchema),
});
const valueSchema = z.object({ type: z.string(), value: z.string() });
const flagStateSchema = z.object({
  environment_default: z.object({
    enabled: z.boolean(),
    value: valueSchema.nullable(),
    variants: z.array(z.object({ id: z.number().int(), weight: z.number() })),
  }),
  segment_overrides: z.array(
    z.object({
      segment: z.object({ id: z.number().int() }),
      priority: z.number().int(),
      enabled: z.boolean(),
    }),
  ),
});
const webhookSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  enabled: z.boolean(),
});
const warehouseSchema = z.object({
  id: z.number().int(),
  status: z.string().nullish(),
});
const metricSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  definition: z.unknown(),
});
const metricEventSchema = z.object({ event: z.string() });
const experimentSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  feature: z.union([z.number().int(), z.object({ id: z.number().int() })]),
});
const experimentMetricSchema = z.object({
  id: z.number().int(),
  metric: z.number().int(),
});

export async function runSetup({
  env,
  fetch: send = fetch,
  timeoutMs = 10_000,
  signal,
}: SetupOptions): Promise<SetupReport> {
  const report: SetupReport = { made: [], found: [], byHand: [] };
  const variables = presentVariables(env);
  if (variables.FLAGSMITH_ORG_API_KEY === undefined) {
    report.failure =
      "No FLAGSMITH_ORG_API_KEY, so the script made nothing. Next: make an organisation API key in Organisation Settings, API Access, set FLAGSMITH_ORG_API_KEY in .env, and run the script again.";
    return report;
  }
  const parsed = settingsSchema.safeParse(variables);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map(({ path }) => String(path[0]))),
    ];
    report.failure = `${names.map((name) => `${name} ${variableRules[name] ?? "is not valid"}`).join("; ")}. Next: fix .env, then run the script again.`;
    return report;
  }
  const settings = parsed.data;
  const api = createApi({
    key: settings.FLAGSMITH_ORG_API_KEY,
    base: settings.FLAGSMITH_ADMIN_API_URL ?? defaultApi,
    send,
    timeoutMs,
    signal,
    secrets: secretsOf(settings),
  });
  try {
    await setUp(api, settings, report);
  } catch (error) {
    if (!isFailure(error)) throw error;
    report.failure = error.message;
  }
  return report;
}

async function setUp(
  api: Api,
  settings: Settings,
  report: SetupReport,
): Promise<void> {
  const projects = await api.list(api.v1("projects/"), projectSchema);
  const projectList = projects
    .map(({ id, name }) => `${id} (${name})`)
    .join(", ");
  if (settings.FLAGSMITH_PROJECT_ID === undefined) {
    report.failure =
      projects.length === 0
        ? "The organisation key sees no project. Next: make the project in the Flagsmith dashboard (README.md, 'Plug in the services'), then run the script again."
        : `No FLAGSMITH_PROJECT_ID. Next: set it in .env to the number of the project, then run the script again. Projects: ${projectList}.`;
    return;
  }
  const project = projects.find(
    ({ id }) => id === settings.FLAGSMITH_PROJECT_ID,
  );
  if (project === undefined) {
    report.failure = `The organisation key sees no project ${settings.FLAGSMITH_PROJECT_ID}. Next: set FLAGSMITH_PROJECT_ID to one of: ${projectList || "no project"}.`;
    return;
  }
  const environments = await api.list(
    api.v1(`environments/?project=${project.id}`),
    environmentSchema,
  );
  const live = environments.find(
    ({ name }) => name === settings.FLAGSMITH_LIVE_ENVIRONMENT,
  );
  if (live === undefined) {
    report.failure = `Project ${project.name} has no environment named ${settings.FLAGSMITH_LIVE_ENVIRONMENT}. Next: set FLAGSMITH_LIVE_ENVIRONMENT to one of: ${environments.map(({ name }) => name).join(", ")}.`;
    return;
  }
  const features = await ensureFeatures(api, project.id, report);
  const experimentFeature = features[experimentFlag];
  const variant = await ensureVariation(
    api,
    project.id,
    experimentFeature.id,
    report,
  );
  const segmentIds = await ensureSegments(api, project.id, report);
  const demoSegmentId = segmentIds.get("demo");
  const langKnSegmentId = segmentIds.get("lang_kn");
  if (demoSegmentId === undefined || langKnSegmentId === undefined) {
    throw failure("The segments demo and lang_kn are missing after setup.");
  }
  for (const environment of environments) {
    await ensureStates(api, environment, features, {
      live: environment.id === live.id,
      demoSegmentId,
      langKnSegmentId,
      variantId: variant.id,
      report,
    });
  }
  const warehouses = new Map<string, boolean>();
  for (const environment of environments) {
    const connections = await api.list(
      api.v1(`environments/${environment.api_key}/warehouse-connections/`),
      warehouseSchema,
    );
    warehouses.set(environment.name, connections.length > 0);
    if (connections.length === 0) {
      report.byHand.push(
        `Turn on the warehouse in ${environment.name}: Environment Settings, Warehouse, Flagsmith, Enable. Flagsmith rejects events without it, and the first event can take hours to show.${environment.name === live.name ? " Then run this script again to make the metric and the experiment." : ""}`,
      );
    }
  }
  if (warehouses.get(live.name) === true) {
    await ensureExperiment(api, project.id, live, {
      featureId: experimentFeature.id,
      variantId: variant.id,
      report,
    });
  }
  await ensureWebhook(api, live, settings.NUDGEBEE_FLAG_WEBHOOK_URL, report);
  report.byHand.push(
    `In ${live.name}, ops_reading has an override for lang_kn, so that the NudgeBee rollback only changes its value. To switch ops_reading for every language at once, change two things: the environment default and this override.`,
    "If it is not done yet, copy the server-side key of each environment (Environment Settings, Keys) into FLAGSMITH_ENVIRONMENT_KEY: Development in .env, Production in the deploy secrets. Then run npm run doctor.",
    'In NudgeBee, keep the values below as variables of the rollback workflow, and keep "Api-Key <organisation API key>" in a NudgeBee Secret (docs/system.md, "NudgeBee workflows").',
  );
  report.rollback = {
    environment: live.name,
    environmentKey: live.api_key,
    opsReadingFeatureId: features.ops_reading.id,
    langKnSegmentId,
  };
}

async function ensureFeatures(
  api: Api,
  projectId: number,
  report: SetupReport,
): Promise<Record<FlagName, Feature>> {
  const url = api.v1(`projects/${projectId}/features/`);
  const existing = new Map(
    (await api.list(`${url}?page_size=100`, featureSchema)).map((feature) => [
      feature.name,
      feature,
    ]),
  );
  const features: Partial<Record<FlagName, Feature>> = {};
  for (const name of flagNames) {
    const found = existing.get(name);
    if (found !== undefined) {
      features[name] = { id: found.id, made: false };
      report.found.push(`flag ${name}`);
      continue;
    }
    const stored = storedDefault(name);
    const made = await api.call("POST", url, featureSchema, {
      name,
      type: flagKinds[name] === "experiment" ? "MULTIVARIATE" : "STANDARD",
      default_enabled: stored.enabled,
      initial_value: stored.value,
      description: descriptions[name],
    });
    features[name] = { id: made.id, made: true };
    report.made.push(`flag ${name}`);
  }
  return features as Record<FlagName, Feature>;
}

async function ensureVariation(
  api: Api,
  projectId: number,
  featureId: number,
  report: SetupReport,
): Promise<{ id: number }> {
  const key = variantKeys.translate_first;
  const url = api.v1(`projects/${projectId}/features/${featureId}/mv-options/`);
  const options = await api.list(url, optionSchema);
  const found =
    options.find((option) => option.key === key) ??
    options.find((option) => option.string_value === variation.value);
  const label = `variation ${variation.value} of ${experimentFlag}`;
  if (found === undefined) {
    const made = await api.call("POST", url, optionSchema, {
      feature: featureId,
      type: "unicode",
      string_value: variation.value,
      key,
      default_percentage_allocation: variation.weight,
    });
    report.made.push(
      `${label}, key ${key}, weight ${variation.weight}% until the experiment starts`,
    );
    return made;
  }
  if (found.key !== key) {
    await api.call("PATCH", `${url}${found.id}/`, optionSchema, { key });
    report.made.push(`key ${key} of the ${label}`);
    return found;
  }
  report.found.push(label);
  return found;
}

async function ensureSegments(
  api: Api,
  projectId: number,
  report: SetupReport,
): Promise<Map<string, number>> {
  const url = api.v1(`projects/${projectId}/segments/`);
  const existing = (
    await api.list(`${url}?page_size=100`, segmentSchema)
  ).filter(({ feature }) => feature === null || feature === undefined);
  const ids = new Map<string, number>();
  for (const segment of segments) {
    const found = existing.find(({ name }) => name === segment.name);
    if (found !== undefined) {
      ids.set(segment.name, found.id);
      report.found.push(`segment ${segment.name}`);
      if (!hasCondition(found.rules, segment)) {
        report.byHand.push(
          `Check the rules of the segment ${segment.name}: the script expects "${segment.property}" equals ${segment.value}, exactly.`,
        );
      }
      continue;
    }
    const made = await api.call("POST", url, segmentSchema, {
      name: segment.name,
      description: segment.description,
      project: projectId,
      rules: [
        {
          type: "ALL",
          rules: [
            {
              type: "ANY",
              conditions: [
                {
                  operator: "EQUAL",
                  property: segment.property,
                  value: segment.value,
                },
              ],
            },
          ],
          conditions: [],
        },
      ],
    });
    ids.set(segment.name, made.id);
    report.made.push(
      `segment ${segment.name}: "${segment.property}" equals ${segment.value}`,
    );
  }
  return ids;
}

async function ensureStates(
  api: Api,
  environment: Environment,
  features: Record<FlagName, Feature>,
  context: {
    live: boolean;
    demoSegmentId: number;
    langKnSegmentId: number;
    variantId: number;
    report: SetupReport;
  },
): Promise<void> {
  const { report } = context;
  for (const name of flagNames) {
    const feature = features[name];
    const url = api.future(
      `environments/${environment.api_key}/features/${feature.id}/`,
    );
    const state = await api.call("GET", url, flagStateSchema);
    const weight =
      state.environment_default.variants.find(
        ({ id }) => id === context.variantId,
      )?.weight ?? 0;
    let resetVariant: number | undefined;
    if (name === experimentFlag && weight > 0) {
      const current = await findExperiment(api, environment, feature.id);
      if (current?.status === "running" || current?.status === "paused") {
        report.byHand.push(
          `In ${environment.name}, the variation ${variation.value} of ${experimentFlag} has weight ${weight}% on the flag while the experiment "${current.name}" is ${current.status}, so the script left the weight as it is. After the experiment ends, run the script again to set it back to 0%.`,
        );
      } else {
        resetVariant = context.variantId;
      }
    }
    const patch = statePatch(name, state, {
      made: feature.made,
      overrides: [
        ...(name === "cfg_demo_trace"
          ? [
              {
                segmentId: context.demoSegmentId,
                segment: "demo",
                enabled: true,
              },
            ]
          : []),
        ...(name === "ops_reading" && context.live
          ? [
              {
                segmentId: context.langKnSegmentId,
                segment: "lang_kn",
                enabled: true,
                value: flagDefaults.ops_reading,
              },
            ]
          : []),
      ],
      resetVariant,
    });
    if (patch === undefined) continue;
    await api.call("PATCH", url, flagStateSchema, patch.body);
    report.made.push(
      ...patch.changes.map((change) => `${environment.name}: ${change}`),
    );
  }
}

async function findExperiment(
  api: Api,
  environment: Environment,
  featureId: number,
): Promise<z.infer<typeof experimentSchema> | undefined> {
  const experiments = await api.list(
    api.v1(`environments/${environment.api_key}/experiments/?page_size=100`),
    experimentSchema,
  );
  return experiments.find(
    ({ feature }) =>
      (typeof feature === "number" ? feature : feature.id) === featureId,
  );
}

async function ensureExperiment(
  api: Api,
  projectId: number,
  live: Environment,
  context: { featureId: number; variantId: number; report: SetupReport },
): Promise<void> {
  const { report } = context;
  const base = `environments/${live.api_key}`;
  const metricsUrl = api.v1(`${base}/experiment-metrics/`);
  const metrics = await api.list(`${metricsUrl}?page_size=100`, metricSchema);
  let metric = metrics.find(
    ({ definition }) =>
      metricEventSchema.safeParse(definition).data?.event === conversionEvent,
  );
  if (metric === undefined) {
    metric = await api.call("POST", metricsUrl, metricSchema, {
      name: conversionEvent,
      description:
        "Occurrences of order_saved_unedited: the seller saved the desk draft with no change.",
      aggregation: "occurrence",
      direction: "up",
      definition: { version: 1, event: conversionEvent },
    });
    report.made.push(`metric ${conversionEvent} in ${live.name}`);
  } else {
    report.found.push(`metric ${conversionEvent} in ${live.name}`);
  }
  const experimentsUrl = api.v1(`${base}/experiments/`);
  let current = await findExperiment(api, live, context.featureId);
  const madeNow = current === undefined;
  if (current === undefined) {
    current = await api.call("POST", experimentsUrl, experimentSchema, {
      feature: context.featureId,
      name: experiment.name,
      hypothesis: experiment.hypothesis,
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: "string", value: "native" },
        multivariate_feature_state_values: [
          {
            multivariate_feature_option: context.variantId,
            percentage_allocation: variation.split,
          },
        ],
      },
    });
    report.made.push(
      `experiment "${current.name}" in ${live.name}: rollout 100%, native ${100 - variation.split}% and translate_first ${variation.split}% once it starts, not started`,
    );
  } else {
    report.found.push(
      `experiment "${current.name}" in ${live.name} (${current.status})`,
    );
  }
  const attachedUrl = api.v1(`${base}/experiments/${current.id}/metrics/`);
  const attached = await api.list(attachedUrl, experimentMetricSchema);
  if (!attached.some(({ metric: id }) => id === metric.id)) {
    if (madeNow || current.status === "created") {
      await api.call("POST", attachedUrl, experimentMetricSchema, {
        metric: metric.id,
        expected_direction: "increase",
      });
      report.made.push(`metric ${conversionEvent} on the experiment`);
    } else {
      report.byHand.push(
        `Add the metric ${conversionEvent} to the experiment "${current.name}" in ${live.name}.`,
      );
    }
  }
  if (current.status === "created") {
    report.byHand.push(
      `Start the experiment "${current.name}" in ${live.name} when the experiment run begins (docs/system.md, "Experiment run"). Starting it sets the ${100 - variation.split}/${variation.split} split. Until then every desk reading is native, because the variation has weight ${variation.weight}% on the flag. Do not start it before: the flag is locked while it runs, and Flagsmith rejects events older than 10 days. ${dashboard}/project/${projectId}/environment/${live.api_key}/experiments/${current.id}`,
    );
  }
}

async function ensureWebhook(
  api: Api,
  live: Environment,
  url: string | undefined,
  report: SetupReport,
): Promise<void> {
  if (url === undefined) {
    report.byHand.push(
      `Set NUDGEBEE_FLAG_WEBHOOK_URL in .env to the Automation Webhook URL of the NudgeBee flag-change workflow (docs/system.md, "NudgeBee workflows"), then run this script again. It sets the Flagsmith webhook of ${live.name}.`,
    );
    return;
  }
  const hooksUrl = api.v1(`environments/${live.api_key}/webhooks/`);
  const hooks = await api.list(hooksUrl, webhookSchema);
  const label = `webhook of ${live.name} to ${maskUrl(url)}`;
  const found = hooks.find((hook) => hook.url === url);
  if (found === undefined) {
    await api.call("POST", hooksUrl, webhookSchema, { url, enabled: true });
    report.made.push(label);
  } else if (found.enabled) {
    report.found.push(label);
  } else {
    report.found.push(label);
    report.byHand.push(
      `The ${label} is off. Turn it on: Environment Settings, Webhooks.`,
    );
  }
}

function createApi({
  key,
  base,
  send,
  timeoutMs,
  signal,
  secrets,
}: {
  key: string;
  base: string;
  send: typeof fetch;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  secrets: string[];
}) {
  const root = base.endsWith("/") ? base : `${base}/`;

  async function call<T>(
    method: "GET" | "POST" | "PATCH",
    url: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const label = `${method} ${new URL(url).pathname}`;
    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        {
          method,
          headers: {
            Authorization: `Api-Key ${key}`,
            Accept: "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        {
          timeoutMs,
          signal,
          fetch: send,
          ...(method === "POST"
            ? { neverRetry: (answer: Response) => answer.status !== 429 }
            : {}),
        },
      );
    } catch (error) {
      if (signal?.aborted) {
        throw failure(
          `Cancelled during ${label}. Next: run the script again. It makes only what is missing.`,
        );
      }
      throw failure(
        (error as Error).name === "TimeoutError"
          ? `Flagsmith did not answer ${label} within ${timeoutMs / 1000} s. Next: check the network, then run the script again.`
          : `Cannot reach Flagsmith for ${label}. Next: check the network and FLAGSMITH_ADMIN_API_URL, then run the script again.`,
      );
    }
    if (!response.ok) {
      const detail = redact((await response.text()).slice(0, 300), secrets);
      throw failure(statusMessage(label, response.status, detail));
    }
    const result = schema.safeParse(await response.json().catch(() => null));
    if (!result.success) {
      throw failure(
        `Flagsmith answered ${label} in a shape that this script does not know. Next: compare the answer with https://api.flagsmith.com/api/v1/swagger.json, and change scripts/flagsmith-setup.ts.`,
      );
    }
    return result.data;
  }

  async function list<T>(url: string, item: z.ZodType<T>): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = url;
    for (let count = 0; next !== undefined && count < 50; count += 1) {
      const answer: unknown[] | z.infer<typeof pageSchema> = await call(
        "GET",
        next,
        z.union([z.array(z.unknown()), pageSchema]),
      );
      const page: z.infer<typeof pageSchema> = Array.isArray(answer)
        ? { next: undefined, results: answer }
        : answer;
      const results = z.array(item).safeParse(page.results);
      if (!results.success) {
        throw failure(
          `Flagsmith listed ${new URL(next).pathname} in a shape that this script does not know. Next: compare the answer with https://api.flagsmith.com/api/v1/swagger.json, and change scripts/flagsmith-setup.ts.`,
        );
      }
      items.push(...results.data);
      next = page.next ? withSearch(url, page.next) : undefined;
    }
    return items;
  }

  return {
    v1: (path: string) => new URL(path, root).href,
    future: (path: string) => new URL(`../__future__/${path}`, root).href,
    call,
    list,
  };
}

export function statePatch(
  name: FlagName,
  state: FlagState,
  context: {
    made: boolean;
    overrides: WantedOverride[];
    resetVariant?: number | undefined;
  },
): StatePatch | undefined {
  const stored = storedDefault(name);
  const current = state.environment_default;
  const environmentDefault: NonNullable<
    StatePatch["body"]["environment_default"]
  > = {};
  const changes: string[] = [];
  if (
    stored.value !== null &&
    (current.value === null ||
      (context.made && current.value.value !== stored.value))
  ) {
    environmentDefault.value = { type: "string", value: stored.value };
  }
  if (
    (context.made || environmentDefault.value !== undefined) &&
    current.enabled !== stored.enabled
  ) {
    environmentDefault.enabled = stored.enabled;
  }
  if (
    environmentDefault.value !== undefined ||
    environmentDefault.enabled !== undefined
  ) {
    changes.push(`default of ${name}`);
  }
  const reset = current.variants.find(
    ({ id, weight }) => id === context.resetVariant && weight > 0,
  );
  if (reset !== undefined) {
    environmentDefault.variants = current.variants.map((variant) =>
      variant.id === reset.id ? { id: variant.id, weight: 0 } : variant,
    );
    changes.push(
      `weight of the variation ${variation.value} of ${name} back to 0% from ${reset.weight}%, because no experiment runs`,
    );
  }
  let priority =
    Math.max(-1, ...state.segment_overrides.map((o) => o.priority)) + 1;
  const overrides: NonNullable<StatePatch["body"]["segment_overrides"]> = [];
  for (const wanted of context.overrides) {
    if (
      state.segment_overrides.some(
        ({ segment }) => segment.id === wanted.segmentId,
      )
    ) {
      continue;
    }
    overrides.push({
      segment: { id: wanted.segmentId },
      enabled: wanted.enabled,
      priority,
      ...(wanted.value === undefined
        ? {}
        : { value: { type: "string" as const, value: wanted.value } }),
    });
    priority += 1;
    changes.push(
      `override of ${name} for the segment ${wanted.segment}, ${wanted.value ?? (wanted.enabled ? "on" : "off")}`,
    );
  }
  if (changes.length === 0) return undefined;
  return {
    body: {
      ...(Object.keys(environmentDefault).length > 0
        ? { environment_default: environmentDefault }
        : {}),
      ...(overrides.length === 0 ? {} : { segment_overrides: overrides }),
    },
    changes,
  };
}

export function formatReport(report: SetupReport): string {
  const lines = ["Flagsmith setup", ""];
  if (report.made.length > 0) {
    lines.push("Made:", ...report.made.map((item) => `  - ${item}`), "");
  } else if (report.failure === undefined) {
    lines.push("Made: nothing. Everything was already there.", "");
  }
  if (report.found.length > 0) {
    lines.push(`Already there: ${report.found.join(", ")}.`, "");
  }
  if (report.failure !== undefined) {
    lines.push(`Stopped: ${report.failure}`, "");
  }
  if (report.byHand.length > 0) {
    lines.push(
      "Still to do by hand:",
      ...report.byHand.map((item, index) => `  ${index + 1}. ${item}`),
      "",
    );
  }
  if (report.rollback !== undefined) {
    const {
      environment,
      environmentKey,
      opsReadingFeatureId,
      langKnSegmentId,
    } = report.rollback;
    lines.push(
      `Values for the NudgeBee rollback workflow (${environment}):`,
      `  environment key (the client-side key, which is not secret): ${environmentKey}`,
      `  ops_reading feature id: ${opsReadingFeatureId}`,
      `  lang_kn segment id: ${langKnSegmentId}`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

export function maskUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}${parsed.search === "" ? "" : "?…"}`;
}

function hasCondition(rules: Rule[], segment: SegmentRule): boolean {
  return rules.some(
    (rule) =>
      (rule.conditions ?? []).some(
        ({ operator, property, value }) =>
          operator === "EQUAL" &&
          property === segment.property &&
          value === segment.value,
      ) || hasCondition(rule.rules ?? [], segment),
  );
}

function statusMessage(label: string, status: number, detail: string): string {
  const said = detail === "" ? "" : `: ${detail}`;
  if (status === 401 || status === 403) {
    return `Flagsmith refused ${label} (${status}). Next: check FLAGSMITH_ORG_API_KEY (Organisation Settings, API Access), and that it can see the project.`;
  }
  if (status === 404) {
    return `Flagsmith found nothing at ${label} (404). Next: check FLAGSMITH_PROJECT_ID and FLAGSMITH_ADMIN_API_URL. If they are right, the API has changed: make this item by hand from docs/system.md ("Flags").`;
  }
  if (status === 429) {
    return `Flagsmith rate-limited ${label} (429). Next: wait a minute, then run the script again.`;
  }
  if (status >= 500) {
    return `Flagsmith answered ${label} with ${status}. Next: run the script again in a few minutes. It makes only what is missing.`;
  }
  return `Flagsmith refused ${label} (${status}${said}). Next: make this item by hand from docs/system.md ("Flags"), or change scripts/flagsmith-setup.ts.`;
}

function secretsOf(settings: Settings): string[] {
  const webhook = settings.NUDGEBEE_FLAG_WEBHOOK_URL;
  const token =
    webhook === undefined ? null : new URL(webhook).searchParams.get("token");
  return [settings.FLAGSMITH_ORG_API_KEY, webhook, token].filter(
    (secret): secret is string => typeof secret === "string" && secret !== "",
  );
}

function redact(text: string, secrets: string[]): string {
  return secrets.reduce(
    (result, secret) => result.replaceAll(secret, "[secret]"),
    text,
  );
}

function withSearch(url: string, next: string): string {
  const target = new URL(url);
  target.search = new URL(next, url).search;
  return target.href;
}

function failure(message: string): Error {
  return Object.assign(new Error(message), { [failureMark]: true });
}

function isFailure(error: unknown): error is Error {
  return error instanceof Error && failureMark in error;
}

if (import.meta.main) {
  const cancel = new AbortController();
  process.once("SIGINT", () => cancel.abort());
  const report = await runSetup({ env: process.env, signal: cancel.signal });
  console.log(formatReport(report));
  process.exitCode = report.failure === undefined ? 0 : 1;
}
