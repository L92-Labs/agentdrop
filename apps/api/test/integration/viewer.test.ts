import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, fakeAccessJwt, initDevice, uploadArtifact } from "../helpers";

describe("viewer routes", () => {
  it("serves HTML viewer and raw bytes", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token, { filename: "view.png" });
    const id = String(uploaded.id);

    const viewer = await api(`/a/${id}`, { headers: { Accept: "text/html" } });
    expect(viewer.status).toBe(200);
    expect(viewer.headers.get("content-type")).toContain("text/html");
    const html = await viewer.text();
    expect(html).toContain("view.png");
    expect(html).toContain("agentdrop");
    expect(html).toContain("deleteArtifactAndGo");
    expect(html).toContain(`data-artifact-id="${id}"`);

    const raw = await api(`/r/${id}/view.png`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-type")).toContain("image/png");
    expect((await raw.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("returns 404 for unknown artifact", async () => {
    const res = await api("/a/art_doesnotexist", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(404);
  });

  it("returns 404 for expired artifact viewer and raw", async () => {
    const { token } = await initDevice();
    const uploaded = await uploadArtifact(token, { filename: "old.png" });
    const id = String(uploaded.id);
    await env.DB.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1000, id)
      .run();

    expect((await api(`/a/${id}`, { headers: { Accept: "text/html" } })).status).toBe(404);
    expect((await api(`/r/${id}/old.png`)).status).toBe(404);
  });

  it("serves /a/:id/render for HTML with CSP", async () => {
    const { token } = await initDevice();
    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode("<h1>hi</h1>")], "page.html", { type: "text/html" }),
    );
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    expect(up.status).toBe(200);
    const { id } = (await up.json()) as { id: string };

    const res = await api(`/a/${id}/render`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await res.text()).toContain("<h1>hi</h1>");
  });

  it("renders markdown with absolute image urls", async () => {
    const { token } = await initDevice();
    const md = "# Hello\n\n![x](https://example.com/a.png)\n";
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode(md)], "note.md", { type: "text/markdown" }));
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    const viewer = await api(`/a/${id}`, { headers: { Accept: "text/html" } });
    expect(viewer.status).toBe(200);
    const html = await viewer.text();
    expect(html).toContain("<h1>");
    expect(html).toContain("Hello");
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain("md-body");
  });

  it("gates password-protected shares until unlock", async () => {
    const { token } = await initDevice();
    const form = new FormData();
    form.append("file", new File([new TextEncoder().encode("secret-bytes")], "x.txt", { type: "text/plain" }));
    form.append("password", "hunter2");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id, password_protected } = (await up.json()) as {
      id: string;
      password_protected: boolean;
    };
    expect(password_protected).toBe(true);

    // Anonymous without cookie → password gate
    const gated = await api(`/a/${id}`, { headers: { Accept: "text/html" } });
    expect(gated.status).toBe(401);
    expect(await gated.text()).toContain("password-protected");

    // Owning device skips password
    const asOwner = await api(`/a/${id}`, {
      headers: { Accept: "text/html" },
      token,
    });
    expect(asOwner.status).toBe(200);

    // Wrong password
    const bad = await api(`/a/${id}/unlock`, {
      method: "POST",
      body: (() => {
        const f = new FormData();
        f.append("password", "wrong");
        return f;
      })(),
    });
    expect(bad.status).toBe(401);

    // Correct unlock sets cookie and redirects
    const unlock = await api(`/a/${id}/unlock`, {
      method: "POST",
      body: (() => {
        const f = new FormData();
        f.append("password", "hunter2");
        return f;
      })(),
      redirect: "manual",
    });
    expect(unlock.status).toBe(303);
    const setCookie = unlock.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`ad_pw_${id}=`);

    const opened = await api(`/a/${id}`, {
      headers: { Accept: "text/html", Cookie: setCookie.split(";")[0]! },
    });
    expect(opened.status).toBe(200);
    expect(await opened.text()).toContain("x.txt");
  });

  it("blocks private render without Access", async () => {
    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const jwt = await fakeAccessJwt("render-owner", "render@test.com");
    await api(`/link/${link_code}`, { method: "POST", accessJwt: jwt });

    const form = new FormData();
    form.append(
      "file",
      new File([new TextEncoder().encode("<p>secret</p>")], "secret.html", { type: "text/html" }),
    );
    form.append("visibility", "private");
    const up = await api("/api/v1/artifacts", { method: "POST", token, body: form });
    const { id } = (await up.json()) as { id: string };

    expect((await api(`/a/${id}/render`)).status).toBe(403);
    const ok = await api(`/a/${id}/render`, { accessJwt: jwt });
    expect(ok.status).toBe(200);
  });
});
