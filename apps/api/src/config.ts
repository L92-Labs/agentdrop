import { loadLimits, type Limits, type LimitsEnv } from "./limits";

export interface AppEnv extends LimitsEnv {
  readonly DB: D1Database;
  readonly DATA: R2Bucket;
  readonly CORS_ORIGINS: string;
  /** Public origin for returned links. Empty = the origin of each request. */
  readonly PUBLIC_BASE_URL?: string;
  readonly TOKEN_PEPPER: string;
  /** Optional: when set, creating a device requires this token (private instance). */
  readonly ENROLL_TOKEN?: string;
  readonly TURNSTILE_SITE_KEY?: string;
  readonly TURNSTILE_SECRET_KEY?: string;
  readonly CF_ACCESS_TEAM_DOMAIN?: string;
  readonly CF_ACCESS_AUD?: string;
}

export interface Config {
  readonly corsOrigins: ReadonlySet<string>;
  readonly publicBaseUrl: string;
  readonly limits: Limits;
  /** Cloudflare Access login (dashboard, device linking) is configured. */
  readonly accessEnabled: boolean;
  /** Turnstile verification is configured. */
  readonly turnstileEnabled: boolean;
}

function parseList(raw: string | undefined): ReadonlySet<string> {
  const out = new Set<string>();
  for (const piece of (raw ?? "").split(",")) {
    const value = piece.trim();
    if (value) out.add(value);
  }
  return out;
}

export function loadConfig(env: AppEnv, requestUrl?: string): Config {
  const configured = (env.PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
  const fallback = requestUrl ? new URL(requestUrl).origin : "";
  return {
    corsOrigins: parseList(env.CORS_ORIGINS),
    publicBaseUrl: configured || fallback,
    limits: loadLimits(env),
    accessEnabled: Boolean(env.CF_ACCESS_TEAM_DOMAIN?.trim() && env.CF_ACCESS_AUD?.trim()),
    turnstileEnabled: Boolean(env.TURNSTILE_SITE_KEY?.trim() && env.TURNSTILE_SECRET_KEY?.trim()),
  };
}

/** Resolve Access-Control-Allow-Origin from configured allow-list. */
export function resolveCorsOrigin(
  allowed: ReadonlySet<string>,
  origin: string | undefined,
): string {
  if (!origin) return "*";
  if (allowed.has("*")) return origin;
  return allowed.has(origin) ? origin : "";
}

/** Secrets the Worker cannot run safely without. Returns the missing names. */
export function missingSecrets(env: Partial<AppEnv>): string[] {
  return (["TOKEN_PEPPER"] as const).filter((name) => !env[name]?.trim());
}
