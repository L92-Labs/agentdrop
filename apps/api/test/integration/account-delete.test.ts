import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, tinyPng, uploadArtifact } from "../helpers";

describe("account delete", () => {
  it("Access account can delete via /dashboard/artifacts/:id", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("del-owner", "del@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const form = new FormData();
    form.append("file", new File([tinyPng()], "bye.png", { type: "image/png" }));
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(up.status).toBe(200);
    const { id } = (await up.json()) as { id: string };

    const del = await api(`/dashboard/artifacts/${id}`, { method: "DELETE", accessJwt: jwt });
    expect(del.status).toBe(200);
    const body = (await del.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const raw = await api(`/r/${id}/bye.png`);
    expect(raw.status).toBe(404);
  });

  it("Access account can delete via API with JWT", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("del-owner-api", "del-api@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const form = new FormData();
    form.append("file", new File([tinyPng()], "bye2.png", { type: "image/png" }));
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    const del = await api(`/api/v1/artifacts/${id}`, { method: "DELETE", accessJwt: jwt });
    expect(del.status).toBe(200);
  });

  it("stranger Access account cannot delete via dashboard", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const ownerJwt = await fakeAccessJwt("del-owner-2", "owner2@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: ownerJwt });

    const form = new FormData();
    form.append("file", new File([tinyPng()], "keep.png", { type: "image/png" }));
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    const stranger = await fakeAccessJwt("stranger-del", "x@test.com");
    const del = await api(`/dashboard/artifacts/${id}`, { method: "DELETE", accessJwt: stranger });
    expect(del.status).toBe(404);
  });

  it("dashboard delete requires Access", async () => {
    const del = await api(`/dashboard/artifacts/art_missing`, { method: "DELETE" });
    expect(del.status).toBe(401);
  });

  it("API delete without auth returns 401", async () => {
    const del = await api("/api/v1/artifacts/art_missing", { method: "DELETE" });
    expect(del.status).toBe(401);
  });

  it("wrong device cannot delete another device artifact", async () => {
    const a = await initDevice();
    const b = await initDevice();
    const uploaded = await uploadArtifact(a.token);
    const id = String(uploaded.id);
    const del = await api(`/api/v1/artifacts/${id}`, { method: "DELETE", token: b.token });
    expect(del.status).toBe(404);
  });

  it("Access cannot delete unclaimed artifact via account match", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token);
    const id = String(uploaded.id);
    const jwt = await fakeAccessJwt("no-claim-del", "noclaim@test.com");
    const del = await api(`/api/v1/artifacts/${id}`, { method: "DELETE", accessJwt: jwt });
    expect(del.status).toBe(404);
  });
});
