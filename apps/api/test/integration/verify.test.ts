import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { api, initDevice } from "../helpers";

describe("verify routes", () => {
  it("GET /verify/:deviceId renders page", async () => {
    const { deviceId } = await initDevice();
    const res = await api(`/verify/${deviceId}`, { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Verify machine");
    expect(html).toContain("onTurnstile");
    expect(html).not.toContain("setInterval");
  });

  it("POST /verify/:deviceId marks device verified", async () => {
    const { token, deviceId } = await initDevice();

    const fetchMock = vi.fn(async () =>
      Response.json({ success: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const form = new FormData();
    form.append("cf-turnstile-response", "test-turnstile-token");
    const res = await api(`/verify/${deviceId}`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);

    const status = await api("/api/v1/device/status", { token });
    const statusJson = (await status.json()) as { tier: string; turnstile_verified_at: number };
    expect(statusJson.tier).toBe("verified");
    expect(statusJson.turnstile_verified_at).toBeTypeOf("number");

    vi.unstubAllGlobals();
  });

  it("POST /verify/:deviceId is idempotent when already verified", async () => {
    const { deviceId } = await initDevice();
    await env.DB.prepare("UPDATE devices SET turnstile_verified_at = ? WHERE id = ?")
      .bind(Date.now(), deviceId)
      .run();

    const form = new FormData();
    form.append("cf-turnstile-response", "reused-token");
    const res = await api(`/verify/${deviceId}`, { method: "POST", body: form });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; already?: boolean };
    expect(json.ok).toBe(true);
    expect(json.already).toBe(true);
  });

  it("unknown device returns 404", async () => {
    expect((await api("/verify/dvc_missing", { headers: { Accept: "text/html" } })).status).toBe(404);
    const post = await api("/verify/dvc_missing", { method: "POST", body: new FormData() });
    expect(post.status).toBe(404);
  });

  it("POST requires turnstile token and rejects failed verify", async () => {
    const { deviceId } = await initDevice();
    const empty = await api(`/verify/${deviceId}`, { method: "POST", body: new FormData() });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe("turnstile_required");

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
    const form = new FormData();
    form.append("cf-turnstile-response", "bad-token");
    const failed = await api(`/verify/${deviceId}`, { method: "POST", body: form });
    expect(failed.status).toBe(403);
    expect(((await failed.json()) as { error: string }).error).toBe("turnstile_failed");
    vi.unstubAllGlobals();
  });
});
