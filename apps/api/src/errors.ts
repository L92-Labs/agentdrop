/**
 * Typed HTTP errors and a Hono `onError` handler.
 *
 * Routes throw {@link HTTPError} for expected failure modes; the handler
 * converts any thrown error into a stable JSON envelope and logs it.
 * Stack traces are never leaked to clients — only the message and code
 * attached to the error are reflected, and only for {@link HTTPError}.
 */
import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "./middleware";
import { logger } from "./logger";

/** Stable machine-readable codes derived from status. */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "service_unavailable"
  | "internal_error";

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 405:
      return "method_not_allowed";
    case 409:
      return "conflict";
    case 503:
      return "service_unavailable";
    default:
      return "internal_error";
  }
}

/**
 * Application-level HTTP error. Throw from any route to short-circuit
 * with a structured response.
 */
export class HTTPError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    opts: { code?: ErrorCode; details?: unknown } = {},
  ) {
    super(message);
    this.name = "HTTPError";
    this.code = opts.code ?? statusToCode(status);
    this.details = opts.details;
  }
}

/** Convenience constructors for the most common error shapes. */
export const badRequest = (message: string, details?: unknown): HTTPError =>
  new HTTPError(400, message, { details });
export const notFound = (message = "not found"): HTTPError =>
  new HTTPError(404, message);
export const serviceUnavailable = (message: string, details?: unknown): HTTPError =>
  new HTTPError(503, message, { details });

interface ErrorEnvelope {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/**
 * Hono error handler. Converts {@link HTTPError} into its status and
 * envelope; anything else is logged at error level and returned as a
 * generic 500 so internal details never reach the client.
 */
export const errorHandler: ErrorHandler<AppContext> = (err, c) => {
  if (err instanceof HTTPError) {
    logger.warn(c, "http_error", {
      status: err.status,
      code: err.code,
      message: err.message,
    });
    const body: ErrorEnvelope = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? null : { details: err.details }),
      },
    };
    return c.json(body, err.status);
  }

  logger.error(c, "unhandled_error", {
    name: err.name,
    message: err.message,
  });
  const body: ErrorEnvelope = {
    ok: false,
    error: { code: "internal_error", message: "internal error" },
  };
  return c.json(body, 500);
};
