import type { Limits } from "../limits";

export type RateTier = "cold" | "verified" | "claimed";

export interface DeviceRateContext {
  tier: RateTier;
  accountId: string | null;
  turnstileVerifiedAt: number | null;
  dailyUploadLimit?: number | null;
}

export function resolveTier(ctx: DeviceRateContext, limits: Limits, now = Date.now()): RateTier {
  if (ctx.accountId) return "claimed";
  if (ctx.turnstileVerifiedAt && now - ctx.turnstileVerifiedAt < limits.turnstileValidMs) {
    return "verified";
  }
  return "cold";
}

export function windowKey(tier: RateTier, deviceId: string, now = Date.now()): string {
  if (tier === "cold") {
    const hour = Math.floor(now / 3_600_000);
    return `rate:${deviceId}:hour:${hour}`;
  }
  const day = Math.floor(now / 86_400_000);
  return `rate:${deviceId}:day:${day}`;
}

export function limitForTier(
  tier: RateTier,
  limits: Limits,
  dailyUploadLimit?: number | null,
): number {
  switch (tier) {
    case "claimed":
      return typeof dailyUploadLimit === "number" && Number.isSafeInteger(dailyUploadLimit) && dailyUploadLimit > 0
        ? dailyUploadLimit
        : limits.uploadsPerDayLinked;
    case "verified":
      return limits.uploadsPerDayVerified;
    default:
      return limits.uploadsPerHour;
  }
}

export async function checkRateLimit(
  db: D1Database,
  deviceId: string,
  ctx: DeviceRateContext,
  limits: Limits,
  opts: { consume?: boolean } = {},
): Promise<{ allowed: boolean; tier: RateTier; remaining: number; key: string }> {
  const consume = opts.consume !== false;
  const tier = resolveTier(ctx, limits);
  const key = windowKey(tier, deviceId);
  const limit = limitForTier(tier, limits, ctx.dailyUploadLimit);
  const now = Date.now();

  const row = await db
    .prepare("SELECT count, window_start FROM rate_counters WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();

  const windowMs = tier === "cold" ? 3_600_000 : 86_400_000;
  let count = row?.count ?? 0;
  if (!row || now - row.window_start >= windowMs) {
    count = 0;
    await db
      .prepare(
        "INSERT INTO rate_counters (key, count, window_start) VALUES (?, 0, ?) ON CONFLICT(key) DO UPDATE SET count = 0, window_start = excluded.window_start",
      )
      .bind(key, now)
      .run();
  }

  if (count >= limit) {
    return { allowed: false, tier, remaining: 0, key };
  }

  if (consume) {
    await db
      .prepare("UPDATE rate_counters SET count = count + 1 WHERE key = ?")
      .bind(key)
      .run();
    return { allowed: true, tier, remaining: limit - count - 1, key };
  }

  return { allowed: true, tier, remaining: limit - count, key };
}

export async function consumeRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare("UPDATE rate_counters SET count = count + 1 WHERE key = ?").bind(key).run();
}
