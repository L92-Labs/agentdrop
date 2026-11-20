/**
 * Instance limits, read from Worker vars (wrangler.jsonc "vars", or the
 * dashboard: Worker → Settings → Variables). Every var is optional; a missing,
 * empty or invalid value falls back to the default below. "0" means unlimited
 * where noted.
 */

const MB = 1024 * 1024;
const DAY_MS = 86_400_000;

export interface Limits {
  /** Largest single file (bytes). */
  readonly maxFileBytes: number;
  /** Active storage per owner — a linked account, or an unlinked device (bytes; 0 = unlimited). */
  readonly maxStorageBytes: number;
  /** Active artifacts per owner (0 = unlimited). */
  readonly maxArtifacts: number;
  /** Active storage across the whole instance (bytes; 0 = unlimited). */
  readonly maxTotalStorageBytes: number;
  /** Default lifetime of an upload from an unlinked device (days). */
  readonly retentionDays: number;
  /** Default lifetime of an upload from a linked device (days). */
  readonly retentionDaysLinked: number;
  /** Longest expiry a linked device may request (days). */
  readonly maxRetentionDays: number;
  /** Uploads per hour for a new device (0 = only verified/linked devices may upload). */
  readonly uploadsPerHour: number;
  /** Uploads per day after a device passes Turnstile (0 = Turnstile does not unlock uploads). */
  readonly uploadsPerDayVerified: number;
  /** Uploads per day for a device linked to an account. */
  readonly uploadsPerDayLinked: number;
  /** How long a Turnstile pass keeps a device in the verified tier (ms). */
  readonly turnstileValidMs: number;
}

export interface LimitsEnv {
  readonly MAX_FILE_MB?: string;
  readonly MAX_STORAGE_MB?: string;
  readonly MAX_ARTIFACTS?: string;
  readonly MAX_TOTAL_STORAGE_MB?: string;
  readonly RETENTION_DAYS?: string;
  readonly RETENTION_DAYS_LINKED?: string;
  readonly MAX_RETENTION_DAYS?: string;
  readonly UPLOADS_PER_HOUR?: string;
  readonly UPLOADS_PER_DAY_VERIFIED?: string;
  readonly UPLOADS_PER_DAY_LINKED?: string;
}

export const LIMIT_DEFAULTS = {
  MAX_FILE_MB: 100,
  MAX_STORAGE_MB: 2048,
  MAX_ARTIFACTS: 1000,
  MAX_TOTAL_STORAGE_MB: 0,
  RETENTION_DAYS: 7,
  RETENTION_DAYS_LINKED: 30,
  MAX_RETENTION_DAYS: 365,
  UPLOADS_PER_HOUR: 5,
  UPLOADS_PER_DAY_VERIFIED: 30,
  UPLOADS_PER_DAY_LINKED: 200,
} as const satisfies Record<keyof LimitsEnv, number>;

/** Parse a non-negative number; `allowZero` controls whether 0 (unlimited) is accepted. */
function num(raw: unknown, fallback: number, allowZero: boolean): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !allowZero)) return fallback;
  return n;
}

export function loadLimits(env: LimitsEnv): Limits {
  const d = LIMIT_DEFAULTS;
  const retentionDays = num(env.RETENTION_DAYS, d.RETENTION_DAYS, false);
  const retentionDaysLinked = num(env.RETENTION_DAYS_LINKED, d.RETENTION_DAYS_LINKED, false);
  const maxRetentionDays = Math.max(
    num(env.MAX_RETENTION_DAYS, d.MAX_RETENTION_DAYS, false),
    retentionDays,
    retentionDaysLinked,
  );
  return {
    maxFileBytes: Math.floor(num(env.MAX_FILE_MB, d.MAX_FILE_MB, false) * MB),
    maxStorageBytes: Math.floor(num(env.MAX_STORAGE_MB, d.MAX_STORAGE_MB, true) * MB),
    maxArtifacts: Math.floor(num(env.MAX_ARTIFACTS, d.MAX_ARTIFACTS, true)),
    maxTotalStorageBytes: Math.floor(num(env.MAX_TOTAL_STORAGE_MB, d.MAX_TOTAL_STORAGE_MB, true) * MB),
    retentionDays,
    retentionDaysLinked,
    maxRetentionDays,
    uploadsPerHour: Math.floor(num(env.UPLOADS_PER_HOUR, d.UPLOADS_PER_HOUR, true)),
    uploadsPerDayVerified: Math.floor(num(env.UPLOADS_PER_DAY_VERIFIED, d.UPLOADS_PER_DAY_VERIFIED, true)),
    uploadsPerDayLinked: Math.floor(num(env.UPLOADS_PER_DAY_LINKED, d.UPLOADS_PER_DAY_LINKED, false)),
    turnstileValidMs: 30 * DAY_MS,
  };
}

/** Defaults with no env overrides (tests, docs). */
export const DEFAULT_LIMITS: Limits = loadLimits({});
