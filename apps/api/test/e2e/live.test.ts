import { describe, expect, it } from "vitest";

const BASE = (process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
const RUN_LIVE = process.env.E2E_LIVE === "1" && BASE !== "";

describe.skipIf(!RUN_LIVE)("live E2E smoke", () => {
  it("healthz", async () => {
    const res = await fetch(`${BASE}/healthz`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true });
  });

  it("device init → upload → view → raw", async () => {
    const initRes = await fetch(`${BASE}/api/v1/device/init`, { method: "POST" });
    expect(initRes.status).toBe(200);
    const init = (await initRes.json()) as { device_token: string };
    const token = init.device_token;

    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const form = new FormData();
    form.append("file", new File([png], "e2e.png", { type: "image/png" }));

    const up = await fetch(`${BASE}/api/v1/artifacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    expect(up.status).toBe(200);
    const artifact = (await up.json()) as { id: string; url: string; raw_url: string };

    const viewer = await fetch(artifact.url, { headers: { Accept: "text/html" } });
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("content-type")).toContain("text/html");

    const raw = await fetch(artifact.raw_url);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("image/png");
  });

  it("skill.md is served", async () => {
    const res = await fetch(`${BASE}/skill.md`);
    expect(res.status).toBe(200);
    const md = await res.text();
    expect(md).toContain("name: agentdrop");
    expect(md).toContain(BASE);
  });

  it("landing page HTML", async () => {
    const res = await fetch(BASE, { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("agentdrop");
    expect(html).toContain("setup-prompt");
  });
});
