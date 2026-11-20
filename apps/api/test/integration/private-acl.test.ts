import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, tinyPng } from "../helpers";

describe("private artifact ACL", () => {
  it("blocks other Access accounts from private artifacts", async () => {
    const { token } = await initDevice();

    // Claim device to owner account
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const ownerJwt = await fakeAccessJwt("owner-sub", "owner@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: ownerJwt });

    // Upload private
    const form = new FormData();
    form.append("file", new File([tinyPng()], "secret.png", { type: "image/png" }));
    form.append("visibility", "private");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(up.status).toBe(200);
    const { id } = (await up.json()) as { id: string };

    // Owner can view
    const ownerView = await api(`/a/${id}`, {
      headers: { Accept: "text/html" },
      accessJwt: ownerJwt,
    });
    expect(ownerView.status).toBe(200);

    // Stranger Access account cannot
    const strangerJwt = await fakeAccessJwt("stranger-sub", "stranger@test.com");
    const strangerView = await api(`/a/${id}`, {
      headers: { Accept: "text/html" },
      accessJwt: strangerJwt,
    });
    expect(strangerView.status).toBe(403);

    const strangerRaw = await api(`/r/${id}/secret.png`, { accessJwt: strangerJwt });
    expect(strangerRaw.status).toBe(403);

    // Unauthenticated cannot
    const anon = await api(`/a/${id}`, { headers: { Accept: "text/html" } });
    expect(anon.status).toBe(403);
  });
});
