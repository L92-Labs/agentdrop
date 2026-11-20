import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, tinyPng, uploadArtifact } from "../helpers";

async function claim(token: string, sub: string, email: string) {
  const start = await api("/api/v1/link/start", { method: "POST", token });
  const { link_code } = (await start.json()) as { link_code: string };
  const jwt = await fakeAccessJwt(sub, email);
  await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });
  return jwt;
}

describe("lifecycle features", () => {
  it("failed mime upload does not burn rate quota", async () => {
    const { token } = await initDevice();
    for (let i = 0; i < 5; i++) {
      const form = new FormData();
      form.append(
        "file",
        new File([new Uint8Array([1, 2, 3])], "bad.exe", { type: "application/octet-stream" }),
      );
      const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
      expect(res.status).toBe(415);
    }
    const ok = await uploadArtifact(token, { filename: "after-fail.png" });
    expect(ok.id).toMatch(/^art_/);
  });

  it("owning device can re-read private artifact with bearer", async () => {
    const { token } = await initDevice();
    await claim(token, "priv-device", "priv-device@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "secret.png", { type: "image/png" }));
    form.append("visibility", "private");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    expect((await api(`/a/${id}`)).status).toBe(403);
    expect((await api(`/r/${id}/secret.png`)).status).toBe(403);

    const viewer = await api(`/a/${id}`, { token, headers: { Accept: "text/html" } });
    expect(viewer.status).toBe(200);
    const raw = await api(`/r/${id}/secret.png`, { token });
    expect(raw.status).toBe(200);
  });

  it("secret visibility requires share token query", async () => {
    const { token } = await initDevice();
    await claim(token, "sec-owner", "sec@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "share.png", { type: "image/png" }));
    form.append("visibility", "secret");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(up.status).toBe(200);
    const body = (await up.json()) as { id: string; share_token: string; url: string };
    expect(body.share_token).toMatch(/^sec_/);
    expect(body.url).toContain(`s=${body.share_token}`);

    expect((await api(`/a/${body.id}`)).status).toBe(403);
    expect((await api(`/a/${body.id}?s=wrong`)).status).toBe(403);
    const ok = await api(`/a/${body.id}?s=${encodeURIComponent(body.share_token)}`, {
      headers: { Accept: "text/html" },
    });
    expect(ok.status).toBe(200);
    const raw = await api(
      `/r/${body.id}/share.png?s=${encodeURIComponent(body.share_token)}`,
    );
    expect(raw.status).toBe(200);
  });

  it("share rotate invalidates old token; revoke demotes to private", async () => {
    const { token } = await initDevice();
    await claim(token, "share-rot", "share-rot@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "leak.png", { type: "image/png" }));
    form.append("visibility", "secret");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const first = (await up.json()) as { id: string; share_token: string };

    const rotated = await api(`/api/v1/artifacts/${first.id}/share/rotate`, {
      method: "POST",
      token,
    });
    expect(rotated.status).toBe(200);
    const next = (await rotated.json()) as { share_token: string; url: string };
    expect(next.share_token).toMatch(/^sec_/);
    expect(next.share_token).not.toBe(first.share_token);

    expect((await api(`/a/${first.id}?s=${encodeURIComponent(first.share_token)}`)).status).toBe(
      403,
    );
    expect(
      (
        await api(`/a/${first.id}?s=${encodeURIComponent(next.share_token)}`, {
          headers: { Accept: "text/html" },
        })
      ).status,
    ).toBe(200);

    const revoked = await api(`/api/v1/artifacts/${first.id}/share/revoke`, {
      method: "POST",
      token,
    });
    expect(revoked.status).toBe(200);
    const after = (await revoked.json()) as { visibility: string; share_token: string | null };
    expect(after.visibility).toBe("private");
    expect(after.share_token).toBeNull();

    expect((await api(`/a/${first.id}?s=${encodeURIComponent(next.share_token)}`)).status).toBe(
      403,
    );
    expect((await api(`/a/${first.id}`, { token, headers: { Accept: "text/html" } })).status).toBe(
      200,
    );
  });

  it("dashboard share rotate works with Access JWT", async () => {
    const { token } = await initDevice();
    const jwt = await claim(token, "dash-share", "dash-share@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "d.png", { type: "image/png" }));
    form.append("visibility", "secret");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id, share_token } = (await up.json()) as { id: string; share_token: string };

    const rot = await api(`/dashboard/artifacts/${id}/share/rotate`, {
      method: "POST",
      accessJwt: jwt,
    });
    expect(rot.status).toBe(200);
    const body = (await rot.json()) as { share_token: string };
    expect(body.share_token).not.toBe(share_token);

    const dash = await api("/dashboard", { accessJwt: jwt, headers: { Accept: "text/html" } });
    const html = await dash.text();
    expect(html).toContain("shareAction");
    expect(html).toContain("rotate link");
  });

  it("PATCH expiry extends TTL and now hides the viewer", async () => {
    const { token } = await initDevice();
    await claim(token, "patch-exp", "patch-exp@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "ttl.png", { type: "image/png" }));
    form.append("visibility", "public");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    const patch = await api(`/api/v1/artifacts/${id}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: "7d" }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { expires_at: string; expires_in: string };
    const exp = Date.parse(body.expires_at);
    expect(exp).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(exp).toBeLessThan(Date.now() + 8 * 86_400_000);
    expect(body.expires_in).toMatch(/day/);

    expect((await api(`/a/${id}`, { headers: { Accept: "text/html" } })).status).toBe(200);

    const expireNow = await api(`/api/v1/artifacts/${id}`, {
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: "now" }),
    });
    expect(expireNow.status).toBe(200);
    expect((await api(`/a/${id}`, { headers: { Accept: "text/html" } })).status).toBe(404);
  });

  it("dashboard PATCH expiry works with Access JWT", async () => {
    const { token } = await initDevice();
    const jwt = await claim(token, "dash-exp", "dash-exp@test.com");
    const form = new FormData();
    form.append("file", new File([tinyPng()], "e.png", { type: "image/png" }));
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    const patch = await api(`/dashboard/artifacts/${id}`, {
      method: "PATCH",
      accessJwt: jwt,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expires: "30d" }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { ok: boolean; expires_in: string };
    expect(body.ok).toBe(true);
    expect(body.expires_in).toMatch(/day/);

    const dash = await api("/dashboard", { accessJwt: jwt, headers: { Accept: "text/html" } });
    const html = await dash.text();
    expect(html).toContain("setExpiry");
    expect(html).toContain("expire");
  });

  it("rotate invalidates old token and revoke blocks further use", async () => {
    const { token } = await initDevice();
    const rot = await api("/api/v1/device/rotate", { method: "POST", token });
    expect(rot.status).toBe(200);
    const { device_token: next } = (await rot.json()) as { device_token: string };

    expect((await api("/api/v1/device/status", { token })).status).toBe(401);
    expect((await api("/api/v1/device/status", { token: next })).status).toBe(200);

    const rev = await api("/api/v1/device/revoke", { method: "POST", token: next });
    expect(rev.status).toBe(200);
    expect((await api("/api/v1/device/status", { token: next })).status).toBe(401);
  });

  it("label and Access dashboard revoke", async () => {
    const { token, deviceId } = await initDevice();
    const jwt = await claim(token, "label-owner", "label@test.com");
    const labeled = await api("/api/v1/device/label", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "codebox" }),
    });
    expect(labeled.status).toBe(200);

    const dash = await api("/dashboard", { accessJwt: jwt, headers: { Accept: "text/html" } });
    expect(await dash.text()).toContain("codebox");

    const rev = await api(`/dashboard/devices/${deviceId}`, {
      method: "DELETE",
      accessJwt: jwt,
    });
    expect(rev.status).toBe(200);
    expect((await api("/api/v1/device/status", { token })).status).toBe(401);
  });

  it("MCP delete_artifact removes upload", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token);
    const id = String(uploaded.id);
    const res = await api("/mcp", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "delete_artifact", arguments: { id } },
      }),
    });
    expect(res.status).toBe(200);
    expect((await api(`/r/${id}/test.png`)).status).toBe(404);
  });

  it("account API includes storage usage", async () => {
    const { token } = await initDevice();
    const jwt = await claim(token, "quota-owner", "quota@test.com");
    await uploadArtifact(token);
    const res = await api("/api/v1/account", { accessJwt: jwt });
    const json = (await res.json()) as { storage: { used_bytes: number; max_bytes: number } };
    expect(json.storage.used_bytes).toBeGreaterThan(0);
    expect(json.storage.max_bytes).toBeGreaterThan(json.storage.used_bytes);
  });

  it("dashboard revoke of unknown device returns 404", async () => {
    const { token } = await initDevice();
    const jwt = await claim(token, "rev404", "rev404@test.com");
    const res = await api("/dashboard/devices/dvc_missing", {
      method: "DELETE",
      accessJwt: jwt,
    });
    expect(res.status).toBe(404);
  });
});
