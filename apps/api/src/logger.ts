/**
 * Minimal structured JSON logger for Cloudflare Workers.
 *
 * Workers observability pipelines (Logpush, tail) ingest `console.log`
 * output directly, so we emit one JSON object per line with a stable
 * schema: `{ level, ts, requestId, message, ...fields }`. No external
 * dependencies, no buffering, no Pino — keep it KISS.
 */
import type { Context } from "hono";
import type { AppContext } from "./middleware";

/**
 * A Hono context carrying at least the request id variable. Every
 * handler in this app uses {@link AppContext}, so the logger targets
 * that shape directly to avoid generic-variance friction.
 */
type LogContext = Context<AppContext>;

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Arbitrary structured fields attached to a log line. */
export type LogFields = Record<string, unknown>;

/** Shared variable key used by the requestId middleware. */
export const REQUEST_ID_VAR = "requestId" as const;

/** Extract the current request id from a Hono context (or "unknown"). */
export function requestId(c: LogContext): string {
  const value = c.get(REQUEST_ID_VAR);
  return typeof value === "string" ? value : "unknown";
}

function emit(
  level: LogLevel,
  c: LogContext,
  message: string,
  fields?: LogFields,
): void {
  const line = JSON.stringify({
    level,
    ts: Date.now(),
    requestId: requestId(c),
    message,
    ...(fields ?? {}),
  });
  console.log(line);
}

/**
 * Dependency-free structured logger. Each method maps to one log level
 * and accepts the Hono context (for request id) plus optional fields.
 */
export const logger = {
  debug: (c: LogContext, message: string, fields?: LogFields) =>
    emit("debug", c, message, fields),
  info: (c: LogContext, message: string, fields?: LogFields) =>
    emit("info", c, message, fields),
  warn: (c: LogContext, message: string, fields?: LogFields) =>
    emit("warn", c, message, fields),
  error: (c: LogContext, message: string, fields?: LogFields) =>
    emit("error", c, message, fields),
};
