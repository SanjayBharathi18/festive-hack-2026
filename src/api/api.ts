import type { z } from "zod";
import { errorBodySchema, type ErrorCode } from "../../shared/errors.ts";

export const clientErrorCodes = [
  "network",
  "timeout",
  "unavailable",
  "bad_response",
] as const;

export type ApiErrorCode = ErrorCode | (typeof clientErrorCodes)[number];

export type ApiError = Error & {
  code: ApiErrorCode;
  status: number | undefined;
  requestId: string | undefined;
  params: { seconds?: number };
};

export type CallOptions = {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  keepalive?: boolean | undefined;
};

export type WriteMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export type Api = {
  get<S extends z.ZodType>(
    path: string,
    schema: S,
    options?: CallOptions,
  ): Promise<z.output<S>>;
  send<S extends z.ZodType>(
    method: WriteMethod,
    path: string,
    body: unknown,
    schema: S,
    options?: CallOptions,
  ): Promise<z.output<S>>;
};

export type ApiDeps = {
  fetch?: (input: string, init: RequestInit) => Promise<Response>;
  online?: () => boolean;
  newKey?: () => string;
  timeoutMs?: number;
  headers?: () => Readonly<Record<string, string | undefined>>;
};

type Payload = {
  body: RequestInit["body"];
  contentType: string | undefined;
  identity: string | object;
};

const apiErrorMark = Symbol("apiError");

export function createApi({
  fetch = (input, init) => globalThis.fetch(input, init),
  online = isOnline,
  newKey = () => crypto.randomUUID(),
  timeoutMs = 20_000,
  headers: extraHeaders = () => ({}),
}: ApiDeps = {}): Api {
  const keys = createRetryKeys(newKey);

  async function call<S extends z.ZodType>(
    method: "GET" | WriteMethod,
    path: string,
    body: unknown,
    schema: S,
    options: CallOptions = {},
  ): Promise<z.output<S>> {
    options.signal?.throwIfAborted();
    if (!online()) throw apiError("network");
    const payload = toPayload(body);
    const headers = new Headers();
    for (const [name, value] of Object.entries(extraHeaders())) {
      if (value !== undefined) headers.set(name, value);
    }
    headers.set("Accept", "application/json");
    if (payload.contentType !== undefined) {
      headers.set("Content-Type", payload.contentType);
    }
    const key =
      method === "POST" ? keys.keyFor(path, payload.identity) : undefined;
    if (key !== undefined) headers.set("Idempotency-Key", key);
    const deadline = createDeadline(
      options.signal,
      options.timeoutMs ?? timeoutMs,
    );
    try {
      const response = await fetch(path, {
        method,
        headers,
        body: payload.body,
        signal: deadline.signal,
        credentials: "same-origin",
        keepalive: options.keepalive ?? false,
      });
      const text = await response.text();
      if (!response.ok) throw failureOf(response, text);
      const value = parseAnswer(text, schema, response.status);
      if (key !== undefined) keys.done(path, payload.identity);
      return value;
    } catch (error) {
      throw deadline.explain(error);
    } finally {
      deadline.clear();
    }
  }

  return {
    get: (path, schema, options) =>
      call("GET", path, undefined, schema, options),
    send: (method, path, body, schema, options) =>
      call(method, path, body, schema, options),
  };
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && apiErrorMark in error;
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function createRetryKeys(newKey: () => string) {
  const byText = new Map<string, string>();
  const byObject = new WeakMap<object, string>();
  return {
    keyFor(path: string, identity: string | object): string {
      const known =
        typeof identity === "string"
          ? byText.get(`${path}\n${identity}`)
          : byObject.get(identity);
      if (known !== undefined) return known;
      const key = newKey();
      if (typeof identity === "string") byText.set(`${path}\n${identity}`, key);
      else byObject.set(identity, key);
      return key;
    },
    done(path: string, identity: string | object): void {
      if (typeof identity === "string") byText.delete(`${path}\n${identity}`);
      else byObject.delete(identity);
    },
  };
}

function createDeadline(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timedOut = new Error("The request took too long.");
  const forward = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forward, { once: true });
  const timer = setTimeout(() => controller.abort(timedOut), ms);
  return {
    signal: controller.signal,
    explain(error: unknown): unknown {
      if (signal?.aborted) return signal.reason;
      if (controller.signal.reason === timedOut) {
        return apiError("timeout", { cause: error });
      }
      if (isApiError(error)) return error;
      if (error instanceof TypeError) {
        return apiError("network", { cause: error });
      }
      return error;
    },
    clear(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

function isOnline(): boolean {
  return !("onLine" in navigator) || navigator.onLine !== false;
}

function toPayload(body: unknown): Payload {
  if (body === undefined) {
    return { body: undefined, contentType: undefined, identity: "" };
  }
  if (
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return { body, contentType: undefined, identity: body };
  }
  const json = JSON.stringify(body);
  return { body: json, contentType: "application/json", identity: json };
}

function parseAnswer<S extends z.ZodType>(
  text: string,
  schema: S,
  status: number,
): z.output<S> {
  let value: unknown;
  if (text !== "") {
    try {
      value = JSON.parse(text);
    } catch (error) {
      throw apiError("bad_response", { status, cause: error });
    }
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw apiError("bad_response", { status, cause: result.error });
  }
  return result.data;
}

function failureOf(response: Response, text: string): ApiError {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = undefined;
  }
  const parsed = errorBodySchema.safeParse(value);
  const code = parsed.success
    ? parsed.data.error.code
    : codeForStatus(response.status);
  const seconds =
    code === "rate_limited"
      ? (retryAfterSeconds(response.headers.get("Retry-After"), Date.now()) ??
        60)
      : undefined;
  return apiError(code, {
    status: response.status,
    requestId: parsed.success
      ? parsed.data.error.request_id
      : (response.headers.get("X-Request-Id") ?? undefined),
    seconds,
  });
}

function apiError(
  code: ApiErrorCode,
  details: {
    status?: number | undefined;
    requestId?: string | undefined;
    seconds?: number | undefined;
    cause?: unknown;
  } = {},
): ApiError {
  return Object.assign(
    new Error(`The API answered ${code}.`, { cause: details.cause }),
    {
      name: "ApiError",
      code,
      status: details.status,
      requestId: details.requestId,
      params: details.seconds === undefined ? {} : { seconds: details.seconds },
      [apiErrorMark]: true,
    },
  );
}

function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "invalid_input";
  if (status === 404) return "not_found";
  if (status === 413) return "payload_too_large";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "internal_error";
}

export function retryAfterSeconds(
  header: string | null,
  nowMs: number,
): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const at = Date.parse(header);
  return Number.isNaN(at)
    ? undefined
    : Math.max(1, Math.ceil((at - nowMs) / 1000));
}
