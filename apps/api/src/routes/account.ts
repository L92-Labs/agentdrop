import { Hono } from "hono";
import { accountUsage, artifactUrls, formatBytes } from "../lib/device";
import { pageError } from "../lib/ui";
import { formatExpiresIn, resolvePatchExpires } from "../lib/expiry";
import { iso } from "../lib/ids";
import { mintShareToken } from "../lib/upload";
import { pageDashboard, type DashboardArtifact, type DashboardDevice } from "../lib/ui";
import type { AppContext } from "../middleware";

export const accountRoutes = new Hono<AppContext>();

function accessLogoutUrl(teamDomain: string, returnTo: string): string | undefined {
  const team = (teamDomain ?? "").replace(/\/$/, "");
  if (!team) return undefined;
  return `${team}/cdn-cgi/access/logout?returnTo=${encodeURIComponent(returnTo)}`;
}

accountRoutes.get("/dashboard", async (c) => {
  if (!c.get("config").accessEnabled) {
    return c.html(
      pageError(
        "Dashboard not enabled",
        "This instance has no account login. The operator can enable it with Cloudflare Access (see docs/SELF_HOSTING.md).",
        404,
      ),
      404,
    );
  }
  const account = c.get("accessAccount");
  if (!account) return c.text("Login via Cloudflare Access", 401);

  const devices = await c.env.DB.prepare(
    "SELECT id, label, turnstile_verified_at, created_at FROM devices WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
  )
    .bind(account.id)
    .all();

  const artifacts = await c.env.DB.prepare(
    `SELECT id, title, filename, mime, visibility, share_token, expires_at, created_at, device_id, password_hash
     FROM artifacts WHERE account_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(account.id, Date.now())
    .all();

  const used = (await accountUsage(c.env.DB, account.id)).bytes;
  const limits = c.get("config").limits;
  const base = c.get("config").publicBaseUrl;
  const rows: DashboardArtifact[] = (artifacts.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const shareToken = r.share_token ? String(r.share_token) : null;
    const urls = artifactUrls(base, String(r.id), String(r.filename), {
      shareToken: String(r.visibility) === "secret" ? shareToken : null,
    });
    return {
      id: String(r.id),
      filename: String(r.filename),
      title: r.title ? String(r.title) : null,
      mime: String(r.mime),
      visibility: String(r.visibility),
      ...urls,
      expires_at: iso(Number(r.expires_at)),
      password_protected: Boolean(r.password_hash),
    };
  });

  const deviceRows: DashboardDevice[] = (devices.results ?? []).map((d) => {
    const row = d as Record<string, unknown>;
    return {
      id: String(row.id),
      label: row.label ? String(row.label) : null,
    };
  });

  return c.html(
    pageDashboard(
      account.email ?? account.id,
      deviceRows,
      rows,
      {
        used,
        max: limits.maxStorageBytes,
        usedLabel: formatBytes(used),
        maxLabel: limits.maxStorageBytes ? formatBytes(limits.maxStorageBytes) : "unlimited",
      },
      {
        logoutUrl: accessLogoutUrl(c.env.CF_ACCESS_TEAM_DOMAIN ?? "", base),
        maxFileLabel: formatBytes(limits.maxFileBytes),
      },
    ),
  );
});

accountRoutes.get("/api/v1/account", async (c) => {
  const account = c.get("accessAccount");
  if (!account) return c.json({ error: "access_required" }, 401);

  const devices = await c.env.DB.prepare(
    "SELECT id, label, created_at FROM devices WHERE account_id = ? AND revoked_at IS NULL",
  )
    .bind(account.id)
    .all();

  const artifacts = await c.env.DB.prepare(
    "SELECT id, filename, mime, visibility, expires_at, size_bytes FROM artifacts WHERE account_id = ? AND expires_at > ?",
  )
    .bind(account.id, Date.now())
    .all();

  const usage = await accountUsage(c.env.DB, account.id);
  const limits = c.get("config").limits;

  return c.json({
    account,
    devices: devices.results ?? [],
    artifacts: artifacts.results ?? [],
    limits: {
      max_bytes_per_file: limits.maxFileBytes,
      max_bytes_storage: limits.maxStorageBytes,
      max_artifacts: limits.maxArtifacts,
    },
    storage: {
      used_bytes: usage.bytes,
      max_bytes: limits.maxStorageBytes,
      artifacts: usage.count,
      max_artifacts: limits.maxArtifacts,
    },
  });
});

/** Browser delete under /dashboard so Cloudflare Access injects the JWT. */
accountRoutes.delete("/dashboard/artifacts/:id", async (c) => {
  const account = c.get("accessAccount");
  if (!account) return c.json({ error: "access_required" }, 401);

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT r2_key, account_id FROM artifacts WHERE id = ?",
  )
    .bind(id)
    .first<{ r2_key: string; account_id: string | null }>();

  if (!row || row.account_id !== account.id) {
    return c.json({ error: "not_found" }, 404);
  }

  await c.env.DATA.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM artifacts WHERE id = ?").bind(id).run();
  return c.json({ ok: true, id });
});

accountRoutes.delete("/dashboard/devices/:id", async (c) => {
  const account = c.get("accessAccount");
  if (!account) return c.json({ error: "access_required" }, 401);

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT id, account_id FROM devices WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; account_id: string | null }>();

  if (!row || row.account_id !== account.id) {
    return c.json({ error: "not_found" }, 404);
  }

  await c.env.DB.prepare(
    "UPDATE devices SET revoked_at = ?, token_hash = ? WHERE id = ?",
  )
    .bind(Date.now(), `revoked:${id}:${Date.now()}`, id)
    .run();

  return c.json({ ok: true, id, revoked: true });
});

async function dashboardOwnedArtifact(c: {
  env: { DB: D1Database };
  get: (k: "accessAccount") => { id: string; email: string | null } | null;
  req: { param: (k: string) => string };
}) {
  const account = c.get("accessAccount");
  if (!account) return { error: "access_required" as const, status: 401 as const };
  const id = c.req.param("id");
  const art = await c.env.DB.prepare(
    "SELECT id, filename, visibility, share_token, account_id FROM artifacts WHERE id = ?",
  )
    .bind(id)
    .first<{
      id: string;
      filename: string;
      visibility: string;
      share_token: string | null;
      account_id: string | null;
    }>();
  if (!art || art.account_id !== account.id) {
    return { error: "not_found" as const, status: 404 as const };
  }
  return { account, art };
}

accountRoutes.post("/dashboard/artifacts/:id/share/rotate", async (c) => {
  const loaded = await dashboardOwnedArtifact(c);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);
  const { art } = loaded;
  if (art.visibility !== "secret") {
    return c.json({ error: "not_secret" }, 400);
  }
  const shareToken = mintShareToken("secret");
  await c.env.DB.prepare("UPDATE artifacts SET share_token = ? WHERE id = ?")
    .bind(shareToken, art.id)
    .run();
  const urls = artifactUrls(c.get("config").publicBaseUrl, art.id, art.filename, { shareToken });
  return c.json({ ok: true, id: art.id, visibility: "secret", share_token: shareToken, ...urls });
});

accountRoutes.post("/dashboard/artifacts/:id/share/revoke", async (c) => {
  const loaded = await dashboardOwnedArtifact(c);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);
  const { art } = loaded;
  await c.env.DB.prepare(
    "UPDATE artifacts SET visibility = 'private', share_token = NULL WHERE id = ?",
  )
    .bind(art.id)
    .run();
  const urls = artifactUrls(c.get("config").publicBaseUrl, art.id, art.filename, {
    shareToken: null,
  });
  return c.json({ ok: true, id: art.id, visibility: "private", share_token: null, ...urls });
});

accountRoutes.patch("/dashboard/artifacts/:id", async (c) => {
  const loaded = await dashboardOwnedArtifact(c);
  if ("error" in loaded) return c.json({ error: loaded.error }, loaded.status);
  const { art } = loaded;

  const body = (await c.req.json().catch(() => null)) as { expires?: string } | null;
  const resolved = resolvePatchExpires(body?.expires, Date.now(), c.get("config").limits.maxRetentionDays);
  if (!resolved.ok) {
    return c.json(
      { error: resolved.error, hint: 'Pass expires as "24h", "7d", "30d", or "now"' },
      400,
    );
  }

  await c.env.DB.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?")
    .bind(resolved.expiresAt, art.id)
    .run();

  const shareToken = art.visibility === "secret" ? art.share_token : null;
  const urls = artifactUrls(c.get("config").publicBaseUrl, art.id, art.filename, { shareToken });
  return c.json({
    ok: true,
    id: art.id,
    expires_at: iso(resolved.expiresAt),
    expires_in: formatExpiresIn(resolved.expiresAt),
    ...urls,
  });
});
