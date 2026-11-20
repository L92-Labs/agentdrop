import { describe, expect, it } from "vitest";
import { checkRateLimit, windowKey } from "../../src/lib/rate-limit";
import { env } from "cloudflare:test";
import { DEFAULT_LIMITS } from "../../src/limits";
import { api, initDevice, tinyPng } from "../helpers";

describe("rate limit integration", () => {
  it("enforces a claimed device override through the live upload gate and status", async () => {
    const { token, deviceId } = await initDevice();
    const accountId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)")
      .bind(accountId, Date.now()).run();
    await env.DB.prepare("UPDATE devices SET account_id = ?, daily_upload_limit = 1000 WHERE id = ?")
      .bind(accountId, deviceId).run();
    const key = windowKey("claimed", deviceId);
    await env.DB.prepare("INSERT INTO rate_counters (key, count, window_start) VALUES (?, 200, ?)")
      .bind(key, Date.now()).run();

    const status = await api("/api/v1/device/status", { token });
    expect((await status.json() as { rate_limit: unknown }).rate_limit)
      .toEqual({ limit: 1000, window: "day" });

    const upload = async () => {
      const form = new FormData();
      form.append("file", new File([tinyPng()], "quota.png", { type: "image/png" }));
      return api("/api/v1/artifacts", { method: "POST", token, body: form });
    };
    const aboveDefault = await upload();
    expect(aboveDefault.status).toBe(200);
    expect((await aboveDefault.json() as { uploads_remaining: number }).uploads_remaining).toBe(799);

    await env.DB.prepare("UPDATE rate_counters SET count = 999 WHERE key = ?").bind(key).run();
    const last = await upload();
    expect(last.status).toBe(200);
    expect((await last.json() as { uploads_remaining: number }).uploads_remaining).toBe(0);
    expect((await upload()).status).toBe(429);

    // Removing the override restores the default without resetting usage.
    await env.DB.prepare("UPDATE devices SET daily_upload_limit = NULL WHERE id = ?").bind(deviceId).run();
    await env.DB.prepare("UPDATE rate_counters SET count = 200 WHERE key = ?").bind(key).run();
    expect((await upload()).status).toBe(429);
    const restored = await api("/api/v1/device/status", { token });
    expect((await restored.json() as { rate_limit: unknown }).rate_limit)
      .toEqual({ limit: 200, window: "day" });
  });

  it("does not grant an unclaimed device a claimed override", async () => {
    const { token, deviceId } = await initDevice();
    await env.DB.prepare("UPDATE devices SET daily_upload_limit = 1000 WHERE id = ?").bind(deviceId).run();
    const status = await api("/api/v1/device/status", { token });
    expect((await status.json() as { rate_limit: unknown }).rate_limit)
      .toEqual({ limit: 5, window: "hour" });
    for (const limit of [0, -1, 1.5]) {
      await expect(env.DB.prepare("UPDATE devices SET daily_upload_limit = ? WHERE id = ?")
        .bind(limit, deviceId).run()).rejects.toThrow();
    }
  });

  it("enforces cold tier hourly cap via checkRateLimit", async () => {
    const { deviceId } = await initDevice();
    const ctx = { tier: "cold" as const, accountId: null, turnstileVerifiedAt: null };

    let lastRemaining = -1;
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(env.DB, deviceId, ctx, DEFAULT_LIMITS);
      expect(r.allowed).toBe(true);
      lastRemaining = r.remaining;
    }
    expect(lastRemaining).toBe(0);

    const blocked = await checkRateLimit(env.DB, deviceId, ctx, DEFAULT_LIMITS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("POST /api/v1/artifacts returns 429 with verify_url when cold capped", async () => {
    const { token, deviceId } = await initDevice();
    for (let i = 0; i < 5; i++) {
      const form = new FormData();
      form.append("file", new File([tinyPng()], `n${i}.png`, { type: "image/png" }));
      const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
      expect(up.status).toBe(200);
    }

    const form = new FormData();
    form.append("file", new File([tinyPng()], "blocked.png", { type: "image/png" }));
    const blocked = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as {
      error: string;
      tier: string;
      verify_url: string;
    };
    expect(json.error).toBe("rate_limit_exceeded");
    expect(json.tier).toBe("cold");
    expect(json.verify_url).toContain(`/verify/${deviceId}`);
  });

  it("enforces verified daily cap", async () => {
    const { deviceId } = await initDevice();
    await env.DB.prepare("UPDATE devices SET turnstile_verified_at = ? WHERE id = ?")
      .bind(Date.now(), deviceId)
      .run();

    const ctx = {
      tier: "cold" as const,
      accountId: null,
      turnstileVerifiedAt: Date.now(),
    };

    for (let i = 0; i < 30; i++) {
      const r = await checkRateLimit(env.DB, deviceId, ctx, DEFAULT_LIMITS);
      expect(r.allowed).toBe(true);
      expect(r.tier).toBe("verified");
    }
    const blocked = await checkRateLimit(env.DB, deviceId, ctx, DEFAULT_LIMITS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.tier).toBe("verified");
  });
});
