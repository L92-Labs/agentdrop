/** Parse human expiry strings and format remaining time. */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Accepts: 24h, 7d, 30d, or integer days. Returns fractional days. */
export function parseExpires(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(h|d|days?|hours?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "d";
  if (unit.startsWith("h")) return n / 24;
  return n;
}

/** Days (may be fractional for hours) → epoch ms. */
export function expiresAtFromDays(days: number): number {
  return Date.now() + days * DAY_MS;
}

export function formatExpiresIn(expiresAtMs: number, now = Date.now()): string {
  const delta = expiresAtMs - now;
  if (delta <= 0) return "expired";
  if (delta < HOUR_MS) return "in <1h";
  if (delta < DAY_MS) {
    const h = Math.round(delta / HOUR_MS);
    return `in ${h}h`;
  }
  const d = Math.round(delta / DAY_MS);
  if (d === 1) return "in 1 day";
  return `in ${d} days`;
}

/**
 * Resolve retention days from expires / retention_days form fields.
 * Claimed devices may set custom TTL (1h to maxDays). Unclaimed keep defaults.
 */
export function resolveRetentionDays(opts: {
  claimed: boolean;
  defaultDays: number;
  /** Longest allowed expiry in days (default 365). */
  maxDays?: number;
  expiresRaw?: string | null;
  retentionDaysRaw?: string | number | null;
}): number {
  const days = opts.defaultDays;
  const max = opts.maxDays ?? 365;
  if (!opts.claimed) return days;

  if (opts.expiresRaw) {
    const parsed = parseExpires(opts.expiresRaw);
    if (parsed != null && parsed >= 1 / 24 && parsed <= max) return parsed;
  }
  if (opts.retentionDaysRaw != null && opts.retentionDaysRaw !== "") {
    const parsed = Number(opts.retentionDaysRaw);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= max) return parsed;
  }
  return days;
}

/**
 * Parse PATCH expiry body. `now` → expire immediately.
 * Relative strings set TTL from now (1h to maxDays).
 */
export function resolvePatchExpires(
  raw: string | null | undefined,
  now = Date.now(),
  maxDays = 365,
): { ok: true; expiresAt: number } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    return { ok: false, error: "expires_required" };
  }
  const s = String(raw).trim().toLowerCase();
  if (s === "now" || s === "0") {
    return { ok: true, expiresAt: now };
  }
  const days = parseExpires(s);
  if (days == null || days < 1 / 24 || days > maxDays) {
    return { ok: false, error: "invalid_expires" };
  }
  return { ok: true, expiresAt: now + days * DAY_MS };
}
