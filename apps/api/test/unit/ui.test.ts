import { DEFAULT_LIMITS } from "../../src/limits";
import { describe, expect, it } from "vitest";
import {
  esc,
  htmlRenderUrl,
  mimeKind,
  mimeLabel,
  page,
  pageApiDocs,
  pageDashboard,
  pageError,
  pageExpired,
  pageLanding,
  pageLinkApprove,
  pageLinkSuccess,
  pagePasswordGate,
  pageVerify,
  pageViewer,
  setupSection,
  wantsHtml,
} from "../../src/lib/ui";

describe("ui", () => {
  it("esc escapes HTML", () => {
    expect(esc(`<script>"&"`)).toBe("&lt;script&gt;&quot;&amp;&quot;");
  });

  it("mimeKind categorizes types", () => {
    expect(mimeKind("image/png")).toBe("image");
    expect(mimeKind("application/pdf")).toBe("pdf");
    expect(mimeKind("application/octet-stream")).toBe("file");
    expect(mimeKind("video/mp4")).toBe("video");
    expect(mimeKind("audio/mpeg")).toBe("audio");
    expect(mimeKind("application/json")).toBe("text");
    expect(mimeKind("text/markdown")).toBe("markdown");
    expect(mimeKind("text/html")).toBe("html");
  });

  it("mimeLabel returns short codes", () => {
    expect(mimeLabel("image/jpeg")).toBe("img");
    expect(mimeLabel("video/mp4")).toBe("vid");
    expect(mimeLabel("audio/wav")).toBe("aud");
  });

  it("pageLanding includes setup section and base URL", () => {
    const html = pageLanding("http://localhost", DEFAULT_LIMITS);
    expect(html).toContain("Set up this machine");
    expect(html).toContain("http://localhost/skill.md");
    expect(html).not.toContain('onclick="copyText("Set up');
  });

  it("setupSection uses textarea not inline JSON onclick", () => {
    const html = setupSection("http://localhost");
    expect(html).toContain('id="setup-prompt"');
    expect(html).toContain("getElementById('setup-prompt').value");
  });

  it("wantsHtml detects HTML paths", () => {
    const mk = (path: string, accept?: string) => ({
      req: {
        path,
        header: (n: string) => (n.toLowerCase() === "accept" ? accept : undefined),
      },
    });
    expect(wantsHtml(mk("/", "application/json"))).toBe(true);
    expect(wantsHtml(mk("/dashboard"))).toBe(true);
    expect(wantsHtml(mk("/api/v1/device/init", "application/json"))).toBe(false);
    expect(wantsHtml(mk("/foo", "text/html"))).toBe(true);
  });

  it("pageDashboard includes delete controls", () => {
    const html = pageDashboard(
      "user@test.com",
      [{ id: "dvc_1", label: "box" }],
      [
        {
          id: "art_abc",
          filename: "shot.png",
          title: "Shot",
          mime: "image/png",
          visibility: "public",
          url: "http://localhost/a/art_abc",
          raw_url: "http://localhost/r/art_abc/shot.png",
          expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        },
      ],
      { used: 100, max: 1000, usedLabel: "100 B", maxLabel: "1000 B" },
      { logoutUrl: "https://team.example/cdn-cgi/access/logout?returnTo=http://localhost" },
    );
    expect(html).toContain("deleteArtifact");
    expect(html).toContain('data-artifact-id="art_abc"');
    expect(html).toContain("btn-danger");
    expect(html).toContain("user@test.com");
    expect(html).toContain("revokeDevice");
    expect(html).toContain("100 B");
    expect(html).toContain("Log out");
    expect(html).toContain("expires in");
    expect(html).toContain("setExpiry");
    expect(html).toContain(">7d</button>");
    expect(html).toContain(">expire</button>");
    expect(html).toContain('<a class="btn btn-ghost topbar-logout"');
  });

  it("pageViewer includes artifact id for delete", () => {
    const html = pageViewer({
      id: "art_xyz",
      title: "t",
      filename: "f.png",
      mime: "image/png",
      viewUrl: "http://localhost/a/art_xyz",
      rawUrl: "http://localhost/r/art_xyz/f.png",
      visibility: "public",
      expiresAt: new Date().toISOString(),
    });
    expect(html).toContain('data-artifact-id="art_xyz"');
    expect(html).toContain("deleteArtifactAndGo");
  });

  const artifact = (over: Record<string, unknown> = {}) => ({
    id: "art_abc",
    filename: "shot.png",
    title: "Shot",
    mime: "image/png",
    visibility: "public",
    url: "http://localhost/a/art_abc",
    raw_url: "http://localhost/r/art_abc/shot.png",
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...over,
  });
  const viewer = (mime: string, extra: Record<string, unknown> = {}) =>
    pageViewer({
      id: "art_v",
      title: "t",
      filename: "f",
      mime,
      viewUrl: "http://localhost/a/art_v",
      rawUrl: "http://localhost/r/art_v/f",
      visibility: "public",
      expiresAt: new Date().toISOString(),
      ...extra,
    });

  it("dashboard card keeps secondary actions in a hidden manage panel", () => {
    const html = pageDashboard("u@test.com", [], [artifact()]);
    expect(html).toContain(
      'aria-expanded="false" aria-controls="manage-art_abc" onclick="toggleManage(this)"',
    );
    expect(html).toContain('<div class="manage-panel" id="manage-art_abc" hidden>');
    expect(html).toContain("function toggleManage(btn)");
    expect(html).toContain("getElementById(btn.getAttribute('aria-controls'))");
    expect(html).not.toContain('<div class="manage-group" data-share-group>');
  });

  it("dashboard share group only renders for secret artifacts", () => {
    const html = pageDashboard("u@test.com", [], [artifact({ id: "art_s", visibility: "secret" })]);
    expect(html).toContain('<div class="manage-group" data-share-group>');
    expect(html).toContain('data-share-action="rotate"');
    expect(html).toContain("card.querySelector('[data-share-group]')");
  });

  it("each artifact card has exactly one primary link: open", () => {
    const html = pageDashboard("u@test.com", [], [artifact(), artifact({ id: "art_2", visibility: "secret" })]);
    const cards = html.split('<article class="artifact-card">').slice(1);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const primaries = card.match(/<a class="btn btn-primary"[^>]*>[^<]*<\/a>/g) ?? [];
      expect(primaries).toHaveLength(1);
      expect(primaries[0]).toContain(">open</a>");
    }
  });

  it("topbar renders brand, nav, then logout; no logout when absent", () => {
    const withLogout = page({ title: "x", body: "", logoutUrl: "https://team.example/logout" });
    const brand = withLogout.indexOf('<a class="brand"');
    const nav = withLogout.indexOf('<nav class="nav"');
    const logout = withLogout.indexOf('<a class="btn btn-ghost topbar-logout"');
    expect(brand).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(brand);
    expect(logout).toBeGreaterThan(nav);
    expect(withLogout).not.toContain('class="topbar-inner topbar-inner--nolog"');
    const without = page({ title: "x", body: "" });
    expect(without).toContain('class="topbar-inner topbar-inner--nolog"');
    expect(without).not.toContain("Log out");
  });

  it("setup prompt source is not a tab stop and scroll regions are focusable", () => {
    const html = pageLanding("http://localhost", DEFAULT_LIMITS);
    expect(html).toContain('class="prompt-source" readonly aria-hidden="true" tabindex="-1"');
    expect(html).toContain('class="prompt-text" tabindex="0" role="region" aria-label="Setup prompt"');
    expect(html).toContain('class="terminal" tabindex="0" role="region" aria-label="Example upload command"');
  });

  it("verify page wraps the widget in a focusable region and sizes #turnstile", () => {
    const html = pageVerify("site", "/verify/dvc_1");
    expect(html).toContain(
      'class="turnstile-wrap" id="turnstile-wrap" tabindex="0" role="region" aria-label="Verification challenge"',
    );
    expect(html).toContain("document.getElementById('turnstile').setAttribute('data-size'");
    expect(html).toContain("w.removeAttribute('tabindex')");
  });

  it("no page or viewer branch emits inline style attributes", () => {
    const pages = [
      pageLanding("http://localhost", DEFAULT_LIMITS),
      pageDashboard("u@test.com", [{ id: "dvc_1", label: "box" }, { id: "dvc_2", label: null }], [
        artifact(),
        artifact({ id: "art_s", visibility: "secret", mime: "text/html", password_protected: true }),
      ], { used: 1, max: 2, usedLabel: "1 B", maxLabel: "2 B" }, { logoutUrl: "/logout", maxFileLabel: "1 MB" }),
      pageDashboard("u@test.com", [], []),
      pagePasswordGate({ id: "art_x", title: "t", error: "nope" }),
      pageLinkApprove("CODE-1234", "u@test.com"),
      pageLinkSuccess(),
      pageExpired("gone"),
      pageVerify("site", "/verify/dvc_1"),
      pageApiDocs("http://localhost"),
      pageError("Not found", "missing", 404),
      viewer("image/png"),
      viewer("video/mp4"),
      viewer("audio/mpeg"),
      viewer("application/pdf"),
      viewer("text/html"),
      viewer("text/markdown", { markdownHtml: "<p>hi</p>" }),
      viewer("text/markdown"),
      viewer("application/json"),
      viewer("application/octet-stream"),
    ];
    for (const html of pages) expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  it("markdown viewer stage gets the doc surface only when rendered", () => {
    expect(viewer("text/markdown", { markdownHtml: "<p>hi</p>" })).toContain(
      'class="viewer-stage viewer-stage-doc"',
    );
    expect(viewer("text/markdown")).toContain('<div class="viewer-stage">');
  });

  it("htmlRenderUrl inserts /render before query string", () => {
    expect(htmlRenderUrl("http://localhost/a/art_xyz")).toBe("http://localhost/a/art_xyz/render");
    expect(htmlRenderUrl("http://localhost/a/art_xyz?s=sec_abc")).toBe(
      "http://localhost/a/art_xyz/render?s=sec_abc",
    );
  });

  it("pageViewer HTML iframe keeps secret token on /render", () => {
    const html = pageViewer({
      id: "art_html",
      title: "page",
      filename: "page.html",
      mime: "text/html",
      viewUrl: "http://localhost/a/art_html?s=sec_abc",
      rawUrl: "http://localhost/r/art_html/page.html?s=sec_abc",
      visibility: "secret",
      expiresAt: new Date().toISOString(),
    });
    expect(html).toContain('iframe src="http://localhost/a/art_html/render?s=sec_abc"');
    expect(html).not.toContain("?s=sec_abc/render");
  });

  it("footer links to the source repository", () => {
    expect(pageLanding("http://localhost", DEFAULT_LIMITS)).toContain(
      'href="https://github.com/L92-Labs/agentdrop" rel="noopener">source</a>',
    );
  });
});
