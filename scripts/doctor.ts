import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  envSchema,
  parseConfig,
  presentVariables,
  type Env,
  type Problem,
} from "../server/config.ts";
import {
  loadRecordings,
  summarizeRecordings,
} from "../server/sarvam/recorded.ts";
import { appendUsage, usageLogFile, type UsageEntry } from "./usage-log.ts";

export type Status = "ok" | "fail" | "not_set";
export type Check = { status: Status; name: string; detail: string };
export type DoctorOptions = {
  env: Env;
  fetch?: typeof fetch;
  usageLog?: URL | string;
  timeoutMs?: number;
  now?: () => number;
};

type Values = Partial<z.output<typeof envSchema>>;
type Call = (url: string, init: RequestInit) => Promise<Response>;

const flagsmithFlagsApi = "https://edge.api.flagsmith.com/api/v1/";
const flagsmithManagementApi = "https://api.flagsmith.com/api/v1/";
const vapidVariables = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
];

const chatUsageSchema = z.object({
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
});
const sarvamErrorSchema = z.object({
  error: z.object({ code: z.string().optional() }),
});
const flagsSchema = z.array(z.unknown());

export async function runDoctor({
  env,
  fetch: send = fetch,
  usageLog = usageLogFile,
  timeoutMs = 10_000,
  now = Date.now,
}: DoctorOptions): Promise<Check[]> {
  const variables = presentVariables(env);
  const parsed = parseConfig(variables);
  const problems = parsed.ok ? [] : parsed.problems;
  const values = validValues(variables);
  const call: Call = (url, init) =>
    send(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const record = (entry: Omit<UsageEntry, "time" | "script">) =>
    appendUsage(usageLog, {
      time: new Date(now()).toISOString(),
      script: "doctor",
      ...entry,
    });
  const checked = [
    "SESSION_SECRET",
    "DATA_DIR",
    "PUBLIC_URL",
    ...vapidVariables,
    "DEMO_DESK_TOKEN",
    "SARVAM_MODE",
    "SARVAM_API_KEY",
    "SARVAM_BASE_URL",
    "FLAGSMITH_API_URL",
    "FLAGSMITH_ADMIN_API_URL",
    "FLAGSMITH_ENVIRONMENT_KEY",
    "FLAGSMITH_ORG_API_KEY",
  ];
  const other = problems.filter(({ variable }) => !checked.includes(variable));
  return [
    parsed.ok
      ? ok("Configuration", "valid, so the server can start")
      : fail(
          "Configuration",
          `the server does not start${other.length > 0 ? `: ${describe(other)}` : ""}. Fix each FAIL line`,
        ),
    sessionSecret(variables, own(problems, ["SESSION_SECRET"])),
    await dataFolder(values.DATA_DIR ?? "./data"),
    publicAddress(values, own(problems, ["PUBLIC_URL"])),
    webPush(variables, own(problems, vapidVariables)),
    demoDesk(variables, own(problems, ["DEMO_DESK_TOKEN"])),
    await sarvam(
      values,
      own(problems, ["SARVAM_MODE", "SARVAM_API_KEY", "SARVAM_BASE_URL"]),
      call,
      record,
      timeoutMs,
    ),
    recordedAnswers(values),
    await flagsmithEnvironment(
      values,
      own(problems, ["FLAGSMITH_API_URL", "FLAGSMITH_ENVIRONMENT_KEY"]),
      call,
    ),
    await flagsmithOrganisation(
      values,
      own(problems, ["FLAGSMITH_ADMIN_API_URL", "FLAGSMITH_ORG_API_KEY"]),
      call,
    ),
  ];
}

function sessionSecret(
  variables: Record<string, string>,
  problems: Problem[],
): Check {
  const name = "Session secret";
  if (problems.length > 0) return fail(name, describe(problems));
  return ok(name, `set, ${variables.SESSION_SECRET?.length} characters`);
}

async function dataFolder(folder: string): Promise<Check> {
  const name = "Data folder";
  try {
    await mkdir(folder, { recursive: true });
    const probe = join(folder, `.doctor-${process.pid}`);
    await writeFile(probe, "");
    await rm(probe);
    return ok(name, `${folder} is writable`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "error";
    return fail(
      name,
      `${folder} is not writable (${code}). Next: make the folder, or set DATA_DIR to a writable folder`,
    );
  }
}

function publicAddress(values: Values, problems: Problem[]): Check {
  const name = "Public address";
  if (problems.length > 0) return fail(name, describe(problems));
  if (values.PUBLIC_URL === undefined) {
    return notSet(
      name,
      "PUBLIC_URL",
      `links in messages and QR codes use http://localhost:${values.PORT ?? 8080}`,
    );
  }
  const url = new URL(values.PUBLIC_URL);
  if (url.protocol === "https:") {
    return ok(
      name,
      `${url.origin} uses HTTPS, so browsers allow the microphone`,
    );
  }
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    return ok(
      name,
      `${url.origin}: the microphone works on this computer only`,
    );
  }
  return fail(
    name,
    `${url.origin} is not HTTPS, so browsers block the microphone. Next: set PUBLIC_URL to the https:// address`,
  );
}

function webPush(
  variables: Record<string, string>,
  problems: Problem[],
): Check {
  const name = "Web push";
  if (problems.length > 0) return fail(name, describe(problems));
  if (vapidVariables.every((variable) => variables[variable] === undefined)) {
    return notSet(
      name,
      "VAPID keys",
      "no push. Web push is on the roadmap, and nothing sends a push yet.",
    );
  }
  return ok(name, "the VAPID keys are one valid P-256 pair");
}

function demoDesk(
  variables: Record<string, string>,
  problems: Problem[],
): Check {
  const name = "Demo desk";
  if (problems.length > 0) return fail(name, describe(problems));
  if (variables.DEMO_DESK_TOKEN === undefined) {
    return notSet(name, "DEMO_DESK_TOKEN", "no demo desk");
  }
  return ok(name, "set, so /desk?demo=<token> opens the demo desk");
}

async function sarvam(
  values: Values,
  problems: Problem[],
  call: Call,
  record: (entry: Omit<UsageEntry, "time" | "script">) => Promise<void>,
  timeoutMs: number,
): Promise<Check> {
  const name = "Sarvam";
  if (problems.length > 0) return fail(name, describe(problems));
  const key = values.SARVAM_API_KEY;
  if (values.SARVAM_MODE !== "live") {
    return key === undefined
      ? notSet(name, "SARVAM_API_KEY", "recorded mode only")
      : ok(
          name,
          "recorded mode, so no call was made. Set SARVAM_MODE=live to check the key",
        );
  }
  const base = (values.SARVAM_BASE_URL ?? "https://api.sarvam.ai").replace(
    /\/+$/,
    "",
  );
  const usage = { api: "chat", model: "sarvam-105b" };
  let response: Response;
  try {
    response = await call(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "api-subscription-key": key ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: usage.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        reasoning_effort: null,
      }),
    });
  } catch (error) {
    const timedOut = (error as Error).name === "TimeoutError";
    await record({
      ...usage,
      result: timedOut ? "timeout" : "network_error",
      units: {},
    });
    return fail(
      name,
      timedOut
        ? `no answer within ${timeoutMs / 1000} s. Next: check the network and SARVAM_BASE_URL, then run npm run doctor again`
        : `cannot reach ${base}. Next: check the network and SARVAM_BASE_URL`,
    );
  }
  const body: unknown = await response.json().catch(() => undefined);
  const billed = chatUsageSchema.safeParse(body);
  const units: Record<string, number> = billed.success
    ? {
        input_tokens: billed.data.usage.prompt_tokens,
        output_tokens: billed.data.usage.completion_tokens,
      }
    : {};
  await record({ ...usage, result: String(response.status), units });
  if (response.ok) {
    return ok(
      name,
      `live, and the key works: ${usage.model} answered (${units.input_tokens ?? 0} input and ${units.output_tokens ?? 0} output tokens billed)`,
    );
  }
  const code = sarvamErrorSchema.safeParse(body).data?.error.code;
  const status = response.status;
  if (status === 402 || code === "seat_budget_exhausted_error") {
    return fail(
      name,
      `no credit left (${status}). Next: add credit, with the approval of the team, or set SARVAM_MODE=recorded`,
    );
  }
  if (status === 401 || status === 403) {
    return fail(
      name,
      `the key was refused (${status}). Next: make a key at https://indus.sarvam.ai/key-management and set SARVAM_API_KEY`,
    );
  }
  if (status === 429) {
    return fail(
      name,
      "rate limited (429). Next: wait a minute, then run npm run doctor again",
    );
  }
  return fail(
    name,
    status >= 500
      ? `Sarvam answered ${status}. Next: try again in a few minutes`
      : `Sarvam answered ${status}. Next: check SARVAM_BASE_URL`,
  );
}

function recordedAnswers(values: Values): Check {
  const name = "Recorded answers";
  let summary: ReturnType<typeof summarizeRecordings>;
  try {
    summary = summarizeRecordings(loadRecordings());
  } catch (error) {
    return fail(
      name,
      `${(error as Error).message.split("\n")[0]} Next: fix the file, or record it again`,
    );
  }
  const counts = `${summary.saved} saved, ${summary.placeholders} of them placeholders, ${summary.test_only} for tests only`;
  if (summary.placeholders === 0) return ok(name, counts);
  if (values.SARVAM_MODE === "live") {
    return ok(name, `${counts}. Live mode does not use them`);
  }
  return {
    status: "not_set",
    name,
    detail: `${counts}, so recorded mode shows made-up answers. Next, before the demo: node --env-file=.env scripts/record-fixtures.ts`,
  };
}

async function flagsmithEnvironment(
  values: Values,
  problems: Problem[],
  call: Call,
): Promise<Check> {
  const name = "Flagsmith environment";
  if (problems.length > 0) return fail(name, describe(problems));
  const key = values.FLAGSMITH_ENVIRONMENT_KEY;
  if (key === undefined) {
    return notSet(
      name,
      "FLAGSMITH_ENVIRONMENT_KEY",
      "the flag defaults in code apply",
    );
  }
  const base = withSlash(values.FLAGSMITH_API_URL ?? flagsmithFlagsApi);
  const result = await answer(call, `${base}flags/`, {
    headers: { "X-Environment-Key": key },
  });
  if (typeof result === "string") return fail(name, result);
  if (result.ok) {
    const flags = flagsSchema.safeParse(await result.json().catch(() => null));
    const count = flags.data?.length;
    return flags.success
      ? ok(
          name,
          `the key works: the environment has ${count} ${count === 1 ? "flag" : "flags"}`,
        )
      : fail(
          name,
          "the answer is not a list of flags. Next: check FLAGSMITH_API_URL",
        );
  }
  return fail(
    name,
    result.status === 401 || result.status === 403
      ? `the key was refused (${result.status}). Next: copy the server-side key from Environment Settings, Keys, into FLAGSMITH_ENVIRONMENT_KEY`
      : `Flagsmith answered ${result.status}. Next: check FLAGSMITH_API_URL, or try again later`,
  );
}

async function flagsmithOrganisation(
  values: Values,
  problems: Problem[],
  call: Call,
): Promise<Check> {
  const name = "Flagsmith organisation key";
  if (problems.length > 0) return fail(name, describe(problems));
  const key = values.FLAGSMITH_ORG_API_KEY;
  if (key === undefined) {
    return notSet(
      name,
      "FLAGSMITH_ORG_API_KEY",
      "the setup and learning-test scripts stop with a message",
    );
  }
  const base = withSlash(
    values.FLAGSMITH_ADMIN_API_URL ?? flagsmithManagementApi,
  );
  const result = await answer(call, `${base}organisations/`, {
    headers: { Authorization: `Api-Key ${key}` },
  });
  if (typeof result === "string") return fail(name, result);
  await result.body?.cancel();
  if (result.ok) return ok(name, "the key works: it can read the organisation");
  return fail(
    name,
    result.status === 401 || result.status === 403
      ? `the key was refused (${result.status}). Next: make an organisation API key in Organisation Settings, API Access, and set FLAGSMITH_ORG_API_KEY`
      : `Flagsmith answered ${result.status}. Next: check FLAGSMITH_ADMIN_API_URL, or try again later`,
  );
}

async function answer(
  call: Call,
  url: string,
  init: RequestInit,
): Promise<Response | string> {
  try {
    return await call(url, init);
  } catch (error) {
    const host = new URL(url).host;
    return (error as Error).name === "TimeoutError"
      ? `${host} did not answer in time. Next: check the network, then run npm run doctor again`
      : `cannot reach ${host}. Next: check the network and FLAGSMITH_API_URL`;
  }
}

export function formatCheck({ status, name, detail }: Check): string {
  const label = { ok: "OK", fail: "FAIL", not_set: "NOT SET" }[status];
  return `${label.padEnd(8)} ${name}: ${detail}`;
}

function validValues(variables: Record<string, string>): Values {
  const values: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(envSchema.shape)) {
    const result = schema.safeParse(variables[name]);
    if (result.success) values[name] = result.data;
  }
  return values as Values;
}

function own(problems: Problem[], variables: string[]): Problem[] {
  return problems.filter(({ variable }) => variables.includes(variable));
}

function describe(problems: Problem[]): string {
  return problems
    .map(({ variable, message }) => `${variable} ${message}`)
    .join("; ");
}

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function ok(name: string, detail: string): Check {
  return { status: "ok", name, detail };
}

function fail(name: string, detail: string): Check {
  return { status: "fail", name, detail };
}

function notSet(name: string, variable: string, effect: string): Check {
  return { status: "not_set", name, detail: `no ${variable}, so ${effect}` };
}

if (import.meta.main) {
  const checks = await runDoctor({ env: process.env });
  for (const check of checks) console.log(formatCheck(check));
  process.exitCode = checks.some(({ status }) => status === "fail") ? 1 : 0;
}
