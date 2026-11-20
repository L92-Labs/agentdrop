/**
 * Composable middleware factories shared across route modules.
 */
import type { MiddlewareHandler } from "hono";
import type { DeviceRecord } from "./shared";
import { loadConfig, missingSecrets, type AppEnv, type Config } from "./config";
import { HTTPError } from "./errors";
import { getAccountFromAccess } from "./lib/access";
import { bearerToken, resolveDevice } from "./lib/device";
import { resolveTier, type RateTier } from "./lib/rate-limit";
import { logger, REQUEST_ID_VAR } from "./logger";

export type AppContext = {
  Bindings: AppEnv;
  Variables: {
    [REQUEST_ID_VAR]: string;
    config: Config;
    device: (DeviceRecord & { token: string }) | null;
    accessAccount: { id: string; email: string | null } | null;
    rateTier: RateTier | null;
  };
};

export const requestIdMiddleware = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const id = c.req.header("x-request-id") || crypto.randomUUID();
    c.set(REQUEST_ID_VAR, id);
    await next();
  };
};

export const accessLogMiddleware = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const startedAt = Date.now();
    await next();
    logger.info(c, "request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration_ms: Date.now() - startedAt,
    });
  };
};

export const configMiddleware = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const missing = missingSecrets(c.env);
    if (missing.length > 0 && c.req.path !== "/healthz") {
      // Fail closed: tokens and password cookies would be hashed with an empty pepper.
      throw new HTTPError(503, `Server misconfigured: set ${missing.join(", ")} (wrangler secret put)`, {
        code: "service_unavailable",
      });
    }
    c.set("config", loadConfig(c.env, c.req.url));
    await next();
  };
};

export const accessMiddleware = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const jwt = c.req.header("Cf-Access-Jwt-Assertion") ?? null;
    const account = await getAccountFromAccess(
      c.env.DB,
      jwt,
      c.env.CF_ACCESS_AUD ?? "",
      c.env.CF_ACCESS_TEAM_DOMAIN ?? "",
    );
    c.set("accessAccount", account);
    await next();
  };
};

export const deviceMiddleware = (): MiddlewareHandler<AppContext> => {
  return async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    const device = token
      ? await resolveDevice(c.env.DB, token, c.env.TOKEN_PEPPER)
      : null;
    c.set("device", device);
    c.set(
      "rateTier",
      device
        ? resolveTier({
            tier: "cold",
            accountId: device.account_id,
            turnstileVerifiedAt: device.turnstile_verified_at,
          }, c.get("config").limits)
        : null,
    );
    await next();
  };
};
