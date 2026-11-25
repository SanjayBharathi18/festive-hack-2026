import type {
  Context,
  ErrorHandler,
  MiddlewareHandler,
  NotFoundHandler,
} from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorBody, ErrorCode } from "../../shared/errors.ts";
import type { Log } from "../log.ts";
import type { AppEnv } from "./context.ts";

export type AppError = Error & {
  status: ContentfulStatusCode;
  code: ErrorCode;
};

const appErrorMark = Symbol("appError");

type Explanation = { code: ErrorCode; message: string };

const explanations: Partial<Record<number, Explanation>> = {
  400: {
    code: "invalid_input",
    message: "The request is not valid. Check it and send it again.",
  },
  401: { code: "not_signed_in", message: "Sign in, then try again." },
  403: {
    code: "forbidden",
    message: "This request is not allowed. Reload the page and try again.",
  },
  404: {
    code: "not_found",
    message: "Nothing is at this address. Check the link.",
  },
  413: {
    code: "payload_too_large",
    message: "The request is too large. Send less data.",
  },
  415: {
    code: "unsupported_media_type",
    message: "Send the body as JSON, with Content-Type: application/json.",
  },
  429: {
    code: "rate_limited",
    message: "Too many requests. Wait a minute, then try again.",
  },
  503: {
    code: "not_ready",
    message: "The server is not ready. Try again in a moment.",
  },
  504: {
    code: "timeout",
    message: "The server took too long to answer. Try again.",
  },
};

const otherClientError: Explanation = {
  code: "invalid_input",
  message: "The server cannot do this request. Check it and try again.",
};

const serverError: Explanation = {
  code: "internal_error",
  message: "Something went wrong on the server. Try again in a minute.",
};

export function appError(
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
): AppError {
  return Object.assign(new Error(message), {
    status,
    code,
    [appErrorMark]: true,
  });
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof Error && appErrorMark in error;
}

export function errorResponse(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
): Response {
  const body: ErrorBody = {
    error: { code, message, request_id: c.get("requestId") },
  };
  return c.json(body, status);
}

export function handleError(log: Log): ErrorHandler<AppEnv> {
  return (error, c) => {
    if (isAppError(error)) {
      return errorResponse(c, error.status, error.code, error.message);
    }
    if (error instanceof HTTPException && error.status < 500) {
      const { code, message } = explanations[error.status] ?? otherClientError;
      return errorResponse(c, error.status, code, error.message || message);
    }
    log({
      request_id: c.get("requestId"),
      error: `${error.name}: ${error.message}`,
      stack: error.stack,
    });
    if (error instanceof HTTPException) {
      const { code, message } = explanations[error.status] ?? serverError;
      return errorResponse(c, error.status, code, message);
    }
    return errorResponse(c, 500, serverError.code, serverError.message);
  };
}

export const normaliseThrows: MiddlewareHandler<AppEnv> = async (_c, next) => {
  try {
    await next();
  } catch (thrown) {
    if (thrown instanceof Error) throw thrown;
    const message = `A value that is not an Error was thrown: ${describe(thrown)}`;
    throw new Error(message, { cause: thrown });
  }
};

export const handleNotFound: NotFoundHandler<AppEnv> = (c) =>
  errorResponse(
    c,
    404,
    "not_found",
    "Nothing is at this address. Check the link.",
  );

function describe(thrown: unknown): string {
  if (typeof thrown === "string") return JSON.stringify(thrown.slice(0, 100));
  if (typeof thrown === "object" && thrown !== null) {
    return `an object (${thrown.constructor?.name ?? "no prototype"})`;
  }
  return String(thrown);
}
