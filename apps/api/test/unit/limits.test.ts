import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { loadConfig, type AppEnv } from "../../src/config";
import { DEFAULT_LIMITS, loadLimits } from "../../src/limits";
import { assertUploadAllowed, normalizeVisibility } from "../../src/lib/upload";
import { initDevice } from "../helpers";

const MB = 1024 * 1024;

async function deviceRow(deviceId: string) {
  return (await env.DB.prepare(
    "SELECT id, account_id, turnstile_verified_at, label, revoked_at, created_at, daily_upload_limit FROM devices WHERE id = ?",
  )
    .bind(deviceId)
    .first())! as never;
}

async function seedArtifact(deviceId: string, size: number) {
  const id = `art_${crypto.randomUUID().slice(0, 8)}`;
  await env.DB.prepare(
    "INSERT INTO artifacts (id, device_id, account_id, filename, mime, size_bytes, r2_key, visibility, expires_at, created_at) VALUES (?, ?, NULL, 'f', 'text/plain', ?, ?, 'public', ?, ?)",
  )
    .bind(id, deviceId, size, `k/${id}`, Date.now() + 86_400_000, Date.now())
    .run();
}

describe("limits", () => {
  it("defaults match the documented values", () => {
    expect(DEFAULT_LIMITS).toMatchObject({
      maxFileBytes: 100 * MB,
      maxStorageBytes: 2048 * MB,
      maxArtifacts: 1000,
      maxTotalStorageBytes: 0,
      retentionDays: 7,
      retentionDaysLinked: 30,
      maxRetentionDays: 365,
      uploadsPerHour: 5,
      uploadsPerDayVerified: 30,
      uploadsPerDayLinked: 200,
    });
  });

  it("parses overrides and ignores invalid values", () => {
    const l = loadLimits({
      MAX_FILE_MB: "1.5",
      MAX_STORAGE_MB: "0",
      MAX_ARTIFACTS: "abc",
      RETENTION_DAYS: "-3",
      RETENTION_DAYS_LINKED: "400",
      MAX_RETENTION_DAYS: "90",
      MAX_FILE_MB_UNUSED: "x",
    } as never);
    expect(l.maxFileBytes).toBe(Math.floor(1.5 * MB));
    expect(l.maxStorageBytes).toBe(0);
    expect(l.maxArtifacts).toBe(1000);
    expect(l.retentionDays).toBe(7);
    expect(l.retentionDaysLinked).toBe(400);
    expect(l.maxRetentionDays).toBe(400);
    expect(loadLimits({ MAX_FILE_MB: "0" }).maxFileBytes).toBe(100 * MB);
  });

  it("config falls back to the request origin and detects optional features", () => {
    const cfg = loadConfig({ CORS_ORIGINS: "*" } as AppEnv, "https://x.workers.dev/a/b?c=1");
    expect(cfg.publicBaseUrl).toBe("https://x.workers.dev");
    expect(cfg.accessEnabled).toBe(false);
    expect(cfg.turnstileEnabled).toBe(false);
    const on = loadConfig(
      {
        PUBLIC_BASE_URL: "https://drop.example.com/",
        CF_ACCESS_TEAM_DOMAIN: "https://t.cloudflareaccess.com",
        CF_ACCESS_AUD: "aud",
        TURNSTILE_SITE_KEY: "k",
        TURNSTILE_SECRET_KEY: "s",
      } as AppEnv,
      "https://other.example/",
    );
    expect(on.publicBaseUrl).toBe("https://drop.example.com");
    expect(on.accessEnabled).toBe(true);
    expect(on.turnstileEnabled).toBe(true);
  });

  it("enforces per-owner artifact count, storage and instance total", async () => {
    const { deviceId } = await initDevice();
    const device = await deviceRow(deviceId);
    await seedArtifact(deviceId, 3 * MB);
    await seedArtifact(deviceId, 3 * MB);

    const count = await assertUploadAllowed(env.DB, device, 1, loadLimits({ MAX_ARTIFACTS: "2" }));
    expect(count).toMatchObject({ ok: false, status: 413, body: { error: "artifact_limit_exceeded" } });

    const storage = await assertUploadAllowed(env.DB, device, 1 * MB, loadLimits({ MAX_STORAGE_MB: "6" }));
    expect(storage).toMatchObject({ ok: false, status: 413, body: { error: "storage_quota_exceeded" } });

    const file = await assertUploadAllowed(env.DB, device, 2 * MB, loadLimits({ MAX_FILE_MB: "1" }));
    expect(file).toMatchObject({ ok: false, status: 413, body: { error: "file_too_large" } });

    const total = await assertUploadAllowed(
      env.DB,
      device,
      1 * MB,
      loadLimits({ MAX_TOTAL_STORAGE_MB: "1", MAX_STORAGE_MB: "0" }),
    );
    expect(total).toMatchObject({ ok: false, status: 507, body: { error: "instance_storage_full" } });

    const unlimited = await assertUploadAllowed(
      env.DB,
      device,
      1 * MB,
      loadLimits({ MAX_ARTIFACTS: "0", MAX_STORAGE_MB: "0" }),
    );
    expect(unlimited.ok).toBe(true);
  });

  it("UPLOADS_PER_HOUR=0 blocks new devices", async () => {
    const { deviceId } = await initDevice();
    const res = await assertUploadAllowed(env.DB, await deviceRow(deviceId), 1, loadLimits({ UPLOADS_PER_HOUR: "0" }));
    expect(res).toMatchObject({ ok: false, status: 429 });
  });

  it("secret links work for unlinked devices only when Access is off", () => {
    expect(normalizeVisibility("secret", false, true)).toMatchObject({ ok: false });
    expect(normalizeVisibility("secret", false, false)).toMatchObject({ ok: true, visibility: "secret" });
    expect(normalizeVisibility("private", false, false)).toMatchObject({ ok: false, error: "private_requires_access" });
    expect(normalizeVisibility("private", true, true)).toMatchObject({ ok: true });
  });
});
