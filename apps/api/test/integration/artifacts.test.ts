import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, tinyPng, uploadArtifact } from "../helpers";

describe("artifacts API", () => {
  it("POST /api/v1/artifacts requires token", async () => {
    const form = new FormData();
    form.append("file", new File([tinyPng()], "x.png", { type: "image/png" }));
    const res = await api("/api/v1/artifacts", { method: "POST", body: form });
    expect(res.status).toBe(401);
  });

  it("POST /api/v1/artifacts uploads PNG", async () => {
    const { token } = await initDevice();
    const json = await uploadArtifact(token, { title: "smoke" });
    expect(String(json.id).startsWith("art_")).toBe(true);
    expect(json.mime).toBe("image/png");
    expect(json.visibility).toBe("public");
    expect(json.uploads_remaining).toBeTypeOf("number");
  });

  it("GET /api/v1/artifacts lists device uploads", async () => {
    const { token } = await initDevice();
    await uploadArtifact(token);
    const res = await api("/api/v1/artifacts", { token });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { artifacts: unknown[] };
    expect(json.artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects blocked mime types", async () => {
    const { token } = await initDevice();
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "malware.exe", { type: "application/octet-stream" }));
    const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(res.status).toBe(415);
  });

  it("private upload requires claimed device", async () => {
    const { token } = await initDevice();
    const form = new FormData();
    form.append("file", new File([tinyPng()], "secret.png", { type: "image/png" }));
    form.append("visibility", "private");
    const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/v1/artifacts/:id removes upload", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token);
    const id = String(uploaded.id);
    const del = await api(`/api/v1/artifacts/${id}`, { method: "DELETE", token });
    expect(del.status).toBe(200);
    const raw = await api(`/r/${id}/test.png`);
    expect(raw.status).toBe(404);
  });

  it("rejects missing file field", async () => {
    const { token } = await initDevice();
    const form = new FormData();
    form.append("title", "no-file");
    const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("file_required");
  });

  it("claimed device can set retention_days", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("ret-owner", "ret@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const form = new FormData();
    form.append("file", new File([tinyPng()], "ret.png", { type: "image/png" }));
    form.append("retention_days", "3");
    const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { expires_at: string; claimed: boolean };
    expect(json.claimed).toBe(true);
    const expires = Date.parse(json.expires_at);
    const threeDays = 3 * 86_400_000;
    expect(expires).toBeGreaterThan(Date.now() + threeDays - 60_000);
    expect(expires).toBeLessThan(Date.now() + threeDays + 60_000);
  });
});
