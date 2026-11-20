/** Shared upload domain helpers for HTTP + MCP. */

import type { Limits } from "../limits";
import { UPLOAD, type DeviceRecord } from "../shared";
import { artifactUrls, ownerUsage, totalStorageUsed, withinLimit } from "./device";
import { resolveRetentionDays } from "./expiry";
import { expiresAt, iso, randomId } from "./ids";
import { hashPassword } from "./password";
import { checkRateLimit, consumeRateLimit, type RateTier } from "./rate-limit";

export type VisibilityResult =
  | { ok: true; visibility: string }
  | { ok: false; error: string; hint?: string };

/**
 * Private links need a linked device (only the owner can open them, via the
 * dashboard). Secret links need one too, unless Access is not configured on
 * this instance — then nobody can link, so every device may create them.
 */
export function normalizeVisibility(
  raw: string | null | undefined,
  claimed: boolean,
  accessEnabled = true,
): VisibilityResult {
  let visibility = (raw || "public").toLowerCase();
  if (visibility !== "public" && visibility !== "private" && visibility !== "secret") {
    visibility = "public";
  }
  if (claimed) return { ok: true, visibility };
  if (visibility === "private" && !accessEnabled) {
    return { ok: false, error: "private_requires_access", hint: "Use --secret: this instance has no account login" };
  }
  if (visibility === "private" || (visibility === "secret" && accessEnabled)) {
    return { ok: false, error: "private_requires_claimed_device", hint: "Run agentdrop link" };
  }
  return { ok: true, visibility };
}

export async function optionalPasswordHash(
  raw: string | null | undefined,
  pepper: string,
): Promise<string | null> {
  const pw = (raw ?? "").trim();
  if (!pw) return null;
  if (pw.length > 200) throw new Error("password_too_long");
  return hashPassword(pw, pepper);
}

export function mintShareToken(visibility: string): string | null {
  return visibility === "secret" ? randomId("sec_", 16) : null;
}

export type RatePeek = {
  allowed: boolean;
  tier: RateTier;
  remaining: number;
  key: string;
};

export type UploadAllowed = {
  ok: true;
  rate: RatePeek;
};

export type UploadDenied = {
  ok: false;
  status: 413 | 429 | 507;
  body: Record<string, unknown>;
};

/** Rate limit peek + file size cap + per-owner and instance quotas. */
export async function assertUploadAllowed(
  db: D1Database,
  device: DeviceRecord,
  sizeBytes: number,
  limits: Limits,
): Promise<UploadAllowed | UploadDenied> {
  const rate = await checkRateLimit(
    db,
    device.id,
    {
      tier: "cold",
      accountId: device.account_id,
      turnstileVerifiedAt: device.turnstile_verified_at,
      dailyUploadLimit: device.daily_upload_limit,
    },
    limits,
    { consume: false },
  );
  if (!rate.allowed) {
    return { ok: false, status: 429, body: { error: "rate_limit_exceeded", tier: rate.tier } };
  }

  if (sizeBytes > limits.maxFileBytes) {
    return {
      ok: false,
      status: 413,
      body: { error: "file_too_large", max_bytes: limits.maxFileBytes, size_bytes: sizeBytes },
    };
  }

  const usage = await ownerUsage(db, device);
  if (!withinLimit(usage.bytes, sizeBytes, limits.maxStorageBytes)) {
    return {
      ok: false,
      status: 413,
      body: {
        error: "storage_quota_exceeded",
        used_bytes: usage.bytes,
        max_bytes: limits.maxStorageBytes,
        incoming_bytes: sizeBytes,
      },
    };
  }
  if (!withinLimit(usage.count, 1, limits.maxArtifacts)) {
    return {
      ok: false,
      status: 413,
      body: { error: "artifact_limit_exceeded", count: usage.count, max_artifacts: limits.maxArtifacts },
    };
  }

  if (limits.maxTotalStorageBytes > 0) {
    const total = await totalStorageUsed(db);
    if (!withinLimit(total, sizeBytes, limits.maxTotalStorageBytes)) {
      return { ok: false, status: 507, body: { error: "instance_storage_full" } };
    }
  }

  return { ok: true, rate };
}

export type ArtifactInsert = {
  id: string;
  deviceId: string;
  accountId: string | null;
  title: string | null;
  filename: string;
  mime: string;
  sizeBytes: number;
  r2Key: string;
  visibility: string;
  shareToken: string | null;
  expiresAt: number;
  passwordHash: string | null;
};

export async function insertArtifact(db: D1Database, row: ArtifactInsert): Promise<void> {
  await db
    .prepare(
      `INSERT INTO artifacts (id, device_id, account_id, title, filename, mime, size_bytes, r2_key, visibility, share_token, expires_at, created_at, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.deviceId,
      row.accountId,
      row.title,
      row.filename,
      row.mime,
      row.sizeBytes,
      row.r2Key,
      row.visibility,
      row.shareToken,
      row.expiresAt,
      Date.now(),
      row.passwordHash,
    )
    .run();
}

export function toUploadResponse(
  base: string,
  row: {
    id: string;
    filename: string;
    visibility: string;
    shareToken: string | null;
    expiresAt: number;
    passwordHash: string | null;
    mime: string;
    sizeBytes: number;
    accountId: string | null;
  },
  extras: { tier?: RateTier; uploadsRemaining?: number } = {},
) {
  const urls = artifactUrls(base, row.id, row.filename, { shareToken: row.shareToken });
  return {
    id: row.id,
    ...urls,
    visibility: row.visibility,
    share_token: row.shareToken,
    expires_at: iso(row.expiresAt),
    password_protected: Boolean(row.passwordHash),
    mime: row.mime,
    size_bytes: row.sizeBytes,
    claimed: Boolean(row.accountId),
    ...(extras.tier != null ? { tier: extras.tier } : {}),
    ...(extras.uploadsRemaining != null ? { uploads_remaining: extras.uploadsRemaining } : {}),
  };
}

export function newArtifactId(): string {
  return randomId("art_", 10);
}

export function artifactR2Key(deviceId: string, id: string, filename: string): string {
  return `artifacts/${deviceId}/${id}/${filename}`;
}

export function deviceRetentionDays(
  device: DeviceRecord,
  limits: Limits,
  expiresRaw?: string | null,
  retentionDaysRaw?: string | number | null,
): number {
  return resolveRetentionDays({
    claimed: Boolean(device.account_id),
    defaultDays: device.account_id ? limits.retentionDaysLinked : limits.retentionDays,
    maxDays: limits.maxRetentionDays,
    expiresRaw,
    retentionDaysRaw,
  });
}

export { expiresAt, consumeRateLimit, UPLOAD };
