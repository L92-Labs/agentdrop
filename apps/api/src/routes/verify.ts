import { Hono } from "hono";
import { pageVerify } from "../lib/ui";
import { verifyTurnstile } from "../lib/turnstile-core";
import type { AppContext } from "../middleware";

export const verifyRoutes = new Hono<AppContext>();

verifyRoutes.use("/verify/*", async (c, next) => {
  if (!c.get("config").turnstileEnabled) {
    return c.json({ ok: false, error: "turnstile_not_configured" }, 404);
  }
  await next();
});

verifyRoutes.get("/verify/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");
  const device = await c.env.DB.prepare("SELECT id FROM devices WHERE id = ?")
    .bind(deviceId)
    .first();
  if (!device) return c.text("Unknown device", 404);

  return c.html(pageVerify(c.env.TURNSTILE_SITE_KEY ?? "", `/verify/${deviceId}`));
});

verifyRoutes.post("/verify/:deviceId", async (c) => {
  const deviceId = c.req.param("deviceId");
  const existing = await c.env.DB.prepare(
    "SELECT id, turnstile_verified_at FROM devices WHERE id = ?",
  )
    .bind(deviceId)
    .first<{ id: string; turnstile_verified_at: number | null }>();
  if (!existing) return c.json({ ok: false, error: "unknown_device" }, 404);

  // Already verified — idempotent success (avoids one-time token reuse races)
  if (existing.turnstile_verified_at) {
    return c.json({ ok: true, already: true });
  }

  const form = await c.req.formData();
  const token = form.get("cf-turnstile-response");
  if (typeof token !== "string" || !token) {
    return c.json({ ok: false, error: "turnstile_required" }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? undefined;
  const ok = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY ?? "", token, ip);
  if (!ok) return c.json({ ok: false, error: "turnstile_failed" }, 403);

  await c.env.DB.prepare("UPDATE devices SET turnstile_verified_at = ? WHERE id = ?")
    .bind(Date.now(), deviceId)
    .run();

  return c.json({ ok: true });
});
