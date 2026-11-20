import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { cleanupExpired } from "../../src/cron";
import { api, initDevice, uploadArtifact } from "../helpers";

describe("cron cleanup", () => {
  it("deletes expired artifacts from R2 and D1", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token);
    const id = String(uploaded.id);

    await env.DB.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1000, id)
      .run();

    const result = await cleanupExpired(env);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const raw = await api(`/r/${id}/test.png`);
    expect(raw.status).toBe(404);
  });

  it("purges expired link_requests and stale rate_counters", async () => {
    const { deviceId } = await initDevice();
    await env.DB.prepare(
      "INSERT INTO link_requests (code, device_id, expires_at) VALUES (?, ?, ?)",
    )
      .bind("ZZZZ-ZZZZ", deviceId, Date.now() - 1000)
      .run();
    await env.DB.prepare(
      "INSERT INTO rate_counters (key, count, window_start) VALUES (?, ?, ?)",
    )
      .bind("rate:stale:hour:1", 1, Date.now() - 8 * 86_400_000)
      .run();

    await cleanupExpired(env);

    const link = await env.DB.prepare("SELECT code FROM link_requests WHERE code = ?")
      .bind("ZZZZ-ZZZZ")
      .first();
    expect(link).toBeNull();

    const rate = await env.DB.prepare("SELECT key FROM rate_counters WHERE key = ?")
      .bind("rate:stale:hour:1")
      .first();
    expect(rate).toBeNull();
  });

  it("scheduled handler invokes cleanup", async () => {
    const cron = (await import("../../src/cron")).default;
    await cron.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);
  });
});
