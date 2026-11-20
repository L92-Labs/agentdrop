import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice } from "../helpers";
import { env } from "cloudflare:test";

describe("link flow", () => {
  it("POST /api/v1/link/start returns code", async () => {
    const { token } = await initDevice();
    const res = await api("/api/v1/link/start", { method: "POST", token });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { link_code: string; verify_url: string };
    expect(json.link_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(json.verify_url).toContain("/link/");
  });

  it("GET /link/:code requires Access", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const res = await api(`/link/${link_code}`);
    expect(res.status).toBe(401);
  });

  it("POST /link/:code claims device", async () => {
    const { token, deviceId } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt();

    const page = await api(`/link/${link_code}`, { accessJwt: jwt });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Link this machine");

    const approve = await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });
    expect(approve.status).toBe(200);
    expect(await approve.text()).toContain("Device linked");

    const status = await api("/api/v1/link/status", { token });
    const statusJson = (await status.json()) as { claimed: boolean; account_id: string };
    expect(statusJson.claimed).toBe(true);
    expect(statusJson.account_id).toBeTruthy();

    const deviceStatus = await api("/api/v1/device/status", { token });
    const deviceJson = (await deviceStatus.json()) as { claimed: boolean; tier: string };
    expect(deviceJson.claimed).toBe(true);
    expect(deviceJson.tier).toBe("claimed");
    expect(deviceId).toBeTruthy();
  });

  it("link/start when already claimed returns claimed", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("already-claimed", "already@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const again = await api("/api/v1/link/start", { method: "POST", token });
    expect(again.status).toBe(200);
    const json = (await again.json()) as { claimed: boolean; account_id: string };
    expect(json.claimed).toBe(true);
    expect(json.account_id).toBeTruthy();
  });

  it("expired or used link code returns 410", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("exp-link", "exp@test.com");

    await env.DB.prepare("UPDATE link_requests SET expires_at = ? WHERE code = ?")
      .bind(Date.now() - 1000, link_code)
      .run();

    const page = await api(`/link/${link_code}`, { accessJwt: jwt });
    expect(page.status).toBe(410);

    const { token: t2 } = await initDevice();
    const start2 = await api("/api/v1/link/start", { method: "POST", token: t2 });
    const { link_code: code2 } = (await start2.json()) as { link_code: string };
    await api(`/link/${code2}`, { method: "POST", accessJwt: jwt });
    const reused = await api(`/link/${code2}`, { accessJwt: jwt });
    expect(reused.status).toBe(410);

    const { token: t3 } = await initDevice();
    const start3 = await api("/api/v1/link/start", { method: "POST", token: t3 });
    const { link_code: code3 } = (await start3.json()) as { link_code: string };
    await env.DB.prepare("UPDATE link_requests SET expires_at = ? WHERE code = ?")
      .bind(Date.now() - 1000, code3)
      .run();
    const postExpired = await api(`/link/${code3}`, { method: "POST", accessJwt: jwt });
    expect(postExpired.status).toBe(410);
  });
});
