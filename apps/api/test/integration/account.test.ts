import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, uploadArtifact } from "../helpers";

describe("account dashboard", () => {
  it("GET /dashboard with Access returns HTML and artifacts", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("dash-owner", "dash@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });
    await uploadArtifact(token, { filename: "dash.png", title: "Dash shot" });

    const res = await api("/dashboard", {
      accessJwt: jwt,
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("dash@test.com");
    expect(html).toContain("dash.png");
    expect(html).toContain("deleteArtifact");
    expect(html).toContain("btn-danger");
  });

  it("GET /api/v1/account returns devices and artifacts", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("acct-api", "acct@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });
    await uploadArtifact(token, { filename: "acct.png" });

    const res = await api("/api/v1/account", { accessJwt: jwt });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      account: { email: string | null };
      devices: unknown[];
      artifacts: { filename: string }[];
    };
    expect(json.account.email).toBe("acct@test.com");
    expect(json.devices.length).toBeGreaterThanOrEqual(1);
    expect(json.artifacts.some((a) => a.filename === "acct.png")).toBe(true);
  });

  it("GET /api/v1/account requires Access", async () => {
    const res = await api("/api/v1/account");
    expect(res.status).toBe(401);
  });

  it("dashboard share rotate / revoke / expiry and account limits", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("dash-share", "share@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "text/plain" }), "s.txt");
    form.append("visibility", "secret");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id, share_token } = (await up.json()) as { id: string; share_token: string };

    const rotated = await api(`/dashboard/artifacts/${id}/share/rotate`, { method: "POST", accessJwt: jwt });
    expect(rotated.status).toBe(200);
    expect(((await rotated.json()) as { share_token: string }).share_token).not.toBe(share_token);

    const patched = await api(`/dashboard/artifacts/${id}`, {
      method: "PATCH",
      accessJwt: jwt,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: "24h" }),
    });
    expect(patched.status).toBe(200);
    const bad = await api(`/dashboard/artifacts/${id}`, {
      method: "PATCH",
      accessJwt: jwt,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: "9999d" }),
    });
    expect(bad.status).toBe(400);

    const revoked = await api(`/dashboard/artifacts/${id}/share/revoke`, { method: "POST", accessJwt: jwt });
    expect(((await revoked.json()) as { visibility: string }).visibility).toBe("private");
    const notSecret = await api(`/dashboard/artifacts/${id}/share/rotate`, { method: "POST", accessJwt: jwt });
    expect(notSecret.status).toBe(400);

    const acct = (await (await api("/api/v1/account", { accessJwt: jwt })).json()) as {
      limits: { max_artifacts: number };
      storage: { artifacts: number };
    };
    expect(acct.limits.max_artifacts).toBe(1000);
    expect(acct.storage.artifacts).toBeGreaterThanOrEqual(1);
  });
});

