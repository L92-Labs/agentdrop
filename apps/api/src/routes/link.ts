import { Hono } from "hono";
import { linkCode } from "../lib/ids";
import { pageExpired, pageLinkApprove, pageLinkSuccess } from "../lib/ui";
import type { AppContext } from "../middleware";

export const linkRoutes = new Hono<AppContext>();

linkRoutes.post("/api/v1/link/start", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);
  if (!c.get("config").accessEnabled) {
    return c.json(
      { error: "access_not_configured", hint: "This instance has no account login (Cloudflare Access)." },
      404,
    );
  }
  if (device.account_id) {
    return c.json({ claimed: true, account_id: device.account_id });
  }

  const code = linkCode();
  const exp = Date.now() + 15 * 60_000;
  await c.env.DB.prepare(
    "INSERT INTO link_requests (code, device_id, expires_at) VALUES (?, ?, ?)",
  )
    .bind(code, device.id, exp)
    .run();

  const base = c.get("config").publicBaseUrl;
  return c.json({
    link_code: code,
    verify_url: `${base}/link/${code}`,
    expires_in: 900,
  });
});

linkRoutes.get("/api/v1/link/status", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);
  return c.json({
    claimed: Boolean(device.account_id),
    account_id: device.account_id,
  });
});

linkRoutes.get("/link/:code", async (c) => {
  const account = c.get("accessAccount");
  if (!account) {
    return c.text("Login via Cloudflare Access required", 401);
  }

  const code = c.req.param("code");
  const req = await c.env.DB.prepare(
    "SELECT device_id, expires_at, completed_at FROM link_requests WHERE code = ?",
  )
    .bind(code)
    .first<{ device_id: string; expires_at: number; completed_at: number | null }>();

  if (!req || req.expires_at <= Date.now() || req.completed_at) {
    return c.html(pageExpired("This link code expired or was already used. Run agentdrop link again."), 410);
  }

  return c.html(pageLinkApprove(code, account.email ?? account.id));
});

linkRoutes.post("/link/:code", async (c) => {
  const account = c.get("accessAccount");
  if (!account) return c.text("Unauthorized", 401);

  const code = c.req.param("code");
  const req = await c.env.DB.prepare(
    "SELECT device_id, expires_at, completed_at FROM link_requests WHERE code = ?",
  )
    .bind(code)
    .first<{ device_id: string; expires_at: number; completed_at: number | null }>();

  if (!req || req.expires_at <= Date.now() || req.completed_at) {
    return c.html(pageExpired("This link code expired or was already used."), 410);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE devices SET account_id = ? WHERE id = ?").bind(
      account.id,
      req.device_id,
    ),
    c.env.DB.prepare(
      "UPDATE artifacts SET account_id = ? WHERE device_id = ? AND account_id IS NULL",
    ).bind(account.id, req.device_id),
    c.env.DB.prepare("UPDATE link_requests SET completed_at = ? WHERE code = ?").bind(
      Date.now(),
      code,
    ),
  ]);

  return c.html(pageLinkSuccess());
});
