import { Hono } from "hono";
import { artifactUrls } from "../lib/device";
import { iso } from "../lib/ids";
import { renderMarkdown } from "../lib/markdown";
import {
  hasValidUnlock,
  mintUnlockCookie,
  unlockCookieHeader,
  verifyPassword,
} from "../lib/password";
import { pageError, pagePasswordGate, pageViewer } from "../lib/ui";
import type { AppContext } from "../middleware";

type ArtifactRow = {
  id: string;
  title: string | null;
  filename: string;
  mime: string;
  r2_key: string;
  visibility: string;
  share_token: string | null;
  expires_at: number;
  account_id: string | null;
  device_id: string;
  password_hash: string | null;
};

export const viewerRoutes = new Hono<AppContext>();

async function loadArtifact(db: D1Database, id: string): Promise<ArtifactRow | null> {
  return db
    .prepare(
      `SELECT id, title, filename, mime, r2_key, visibility, share_token, expires_at,
              account_id, device_id, password_hash
       FROM artifacts WHERE id = ?`,
    )
    .bind(id)
    .first<ArtifactRow>();
}

function shareTokenFromRequest(c: {
  req: { query: (k: string) => string | undefined };
}): string | null {
  const s = c.req.query("s");
  return s && s.length > 0 ? s : null;
}

function secretQs(c: { req: { query: (k: string) => string | undefined } }): string {
  const s = shareTokenFromRequest(c);
  return s ? `?s=${encodeURIComponent(s)}` : "";
}

function isOwner(
  c: {
    get: (k: "accessAccount" | "device") =>
      | { id: string }
      | ({ id: string } & { token: string })
      | null;
  },
  art: ArtifactRow,
): boolean {
  const device = c.get("device");
  if (device && art.device_id === device.id) return true;
  const account = c.get("accessAccount");
  if (account && art.account_id && art.account_id === account.id) return true;
  return false;
}

function canView(
  c: {
    get: (k: "accessAccount" | "device") =>
      | { id: string }
      | ({ id: string } & { token: string })
      | null;
    req: { query: (k: string) => string | undefined };
  },
  art: ArtifactRow,
): boolean {
  if (art.visibility === "public") return true;

  if (isOwner(c, art)) return true;

  if (art.visibility === "secret" && art.share_token) {
    const provided = shareTokenFromRequest(c);
    if (provided && provided === art.share_token) return true;
  }

  return false;
}

async function passwordOk(
  c: {
    req: { header: (k: string) => string | undefined };
    env: { TOKEN_PEPPER: string };
    get: (k: "accessAccount" | "device") =>
      | { id: string }
      | ({ id: string } & { token: string })
      | null;
  },
  art: ArtifactRow,
): Promise<boolean> {
  if (!art.password_hash) return true;
  if (isOwner(c, art)) return true;
  return hasValidUnlock(c.req.header("Cookie"), art.id, c.env.TOKEN_PEPPER);
}

viewerRoutes.get("/a/:id", async (c) => {
  const art = await loadArtifact(c.env.DB, c.req.param("id"));
  if (!art || art.expires_at <= Date.now()) {
    return c.html(pageError("Not found", "This artifact doesn't exist or has expired.", 404), 404);
  }
  if (!canView(c, art)) {
    const msg =
      art.visibility === "secret"
        ? "This secret link is missing or invalid."
        : "Sign in via Cloudflare Access or use the uploading device token to view this file.";
    return c.html(pageError("Private artifact", msg, 403), 403);
  }
  if (!(await passwordOk(c, art))) {
    return c.html(
      pagePasswordGate({
        id: art.id,
        title: art.title || art.filename,
        secretQs: secretQs(c),
      }),
      401,
    );
  }

  const base = c.get("config").publicBaseUrl;
  const urls = artifactUrls(base, art.id, art.filename, {
    shareToken: art.visibility === "secret" ? art.share_token : null,
  });

  let markdownHtml: string | undefined;
  if (art.mime === "text/markdown" || art.mime === "text/x-markdown") {
    const obj = await c.env.DATA.get(art.r2_key);
    if (obj) {
      const text = await obj.text();
      markdownHtml = renderMarkdown(text);
    }
  }

  return c.html(
    pageViewer({
      id: art.id,
      title: art.title || art.filename,
      filename: art.filename,
      mime: art.mime,
      viewUrl: urls.url,
      rawUrl: urls.raw_url,
      visibility: art.visibility,
      expiresAt: iso(art.expires_at),
      markdownHtml,
      passwordProtected: Boolean(art.password_hash),
    }),
  );
});

viewerRoutes.post("/a/:id/unlock", async (c) => {
  const art = await loadArtifact(c.env.DB, c.req.param("id"));
  if (!art || art.expires_at <= Date.now()) {
    return c.html(pageError("Not found", "This artifact doesn't exist or has expired.", 404), 404);
  }
  if (!canView(c, art)) {
    return c.html(pageError("Private artifact", "You cannot unlock this file.", 403), 403);
  }
  if (!art.password_hash) {
    return c.redirect(`/a/${art.id}${secretQs(c)}`);
  }

  const form = await c.req.formData();
  const password = String(form.get("password") ?? "");
  const ok = await verifyPassword(password, art.password_hash, c.env.TOKEN_PEPPER);
  if (!ok) {
    return c.html(
      pagePasswordGate({
        id: art.id,
        title: art.title || art.filename,
        secretQs: secretQs(c),
        error: "Wrong password.",
      }),
      401,
    );
  }

  const cookie = await mintUnlockCookie(art.id, c.env.TOKEN_PEPPER);
  const headers = new Headers();
  headers.set("Set-Cookie", unlockCookieHeader(cookie));
  headers.set("Location", `/a/${art.id}${secretQs(c)}`);
  return new Response(null, { status: 303, headers });
});

viewerRoutes.get("/a/:id/render", async (c) => {
  const art = await loadArtifact(c.env.DB, c.req.param("id"));
  if (!art || art.expires_at <= Date.now() || art.mime !== "text/html") {
    return c.text("Not found", 404);
  }
  if (!canView(c, art)) return c.text("Forbidden", 403);
  if (!(await passwordOk(c, art))) return c.text("Password required", 401);

  const obj = await c.env.DATA.get(art.r2_key);
  if (!obj) return c.text("Not found", 404);
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set(
    "content-security-policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:",
  );
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
});

viewerRoutes.get("/r/:id/:filename{.+}", async (c) => {
  const art = await loadArtifact(c.env.DB, c.req.param("id"));
  if (!art || art.expires_at <= Date.now()) {
    return c.text("Not found or expired", 404);
  }
  if (!canView(c, art)) return c.text("Forbidden", 403);
  if (!(await passwordOk(c, art))) return c.text("Password required", 401);

  const obj = await c.env.DATA.get(art.r2_key);
  if (!obj) return c.text("Not found", 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(obj.body, { headers });
});
