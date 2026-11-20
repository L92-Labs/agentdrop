import { Hono } from "hono";
import { formatBytes, ownerUsage } from "../lib/device";
import { deviceToken, hashToken, randomId } from "../lib/ids";
import { limitForTier } from "../lib/rate-limit";
import type { AppContext } from "../middleware";

export const deviceRoutes = new Hono<AppContext>();

/** Constant-time string compare (enroll token). */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

deviceRoutes.post("/api/v1/device/init", async (c) => {
  const enroll = c.env.ENROLL_TOKEN?.trim();
  if (enroll && !safeEqual(c.req.header("x-enroll-token")?.trim() ?? "", enroll)) {
    return c.json(
      {
        error: "enroll_token_required",
        hint: "This instance is private: agentdrop init <url> --enroll <token> (header X-Enroll-Token)",
      },
      401,
    );
  }
  const token = deviceToken();
  const id = randomId("dvc_", 10);
  const tokenHash = await hashToken(token, c.env.TOKEN_PEPPER);
  await c.env.DB.prepare(
    "INSERT INTO devices (id, token_hash, created_at) VALUES (?, ?, ?)",
  )
    .bind(id, tokenHash, Date.now())
    .run();

  return c.json({
    device_token: token,
    device_id: id,
    token_path: "~/.agentdrop/token.json",
    hint: 'Save {"device_token":"..."} to ~/.agentdrop/token.json (chmod 600)',
  });
});

deviceRoutes.get("/api/v1/device/status", async (c) => {
  const device = c.get("device");
  if (!device) {
    return c.json({ error: "missing_device_token" }, 401);
  }
  const tier = c.get("rateTier") ?? "cold";
  const limits = c.get("config").limits;
  const usage = await ownerUsage(c.env.DB, device);
  return c.json({
    device_id: device.id,
    label: device.label,
    claimed: Boolean(device.account_id),
    account_id: device.account_id,
    turnstile_verified_at: device.turnstile_verified_at,
    tier,
    rate_limit: {
      limit: limitForTier(tier, limits, device.daily_upload_limit),
      window: tier === "cold" ? "hour" : "day",
    },
    limits: {
      max_bytes_per_file: limits.maxFileBytes,
      max_bytes_storage: limits.maxStorageBytes,
      max_artifacts: limits.maxArtifacts,
      max_bytes_per_file_label: formatBytes(limits.maxFileBytes),
      max_bytes_storage_label: limits.maxStorageBytes ? formatBytes(limits.maxStorageBytes) : "unlimited",
    },
    storage: {
      used_bytes: usage.bytes,
      max_bytes: limits.maxStorageBytes,
      artifacts: usage.count,
      max_artifacts: limits.maxArtifacts,
    },
    verify_url: `${c.get("config").publicBaseUrl}/verify/${device.id}`,
  });
});

/** Rotate bearer token; old token stops working immediately. */
deviceRoutes.post("/api/v1/device/rotate", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const token = deviceToken();
  const tokenHash = await hashToken(token, c.env.TOKEN_PEPPER);
  await c.env.DB.prepare("UPDATE devices SET token_hash = ? WHERE id = ?")
    .bind(tokenHash, device.id)
    .run();

  return c.json({
    device_token: token,
    device_id: device.id,
    hint: "Update ~/.agentdrop/token.json with the new device_token",
  });
});

deviceRoutes.post("/api/v1/device/label", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const body = (await c.req.json().catch(() => ({}))) as { label?: string };
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  await c.env.DB.prepare("UPDATE devices SET label = ? WHERE id = ?")
    .bind(label, device.id)
    .run();

  return c.json({ ok: true, device_id: device.id, label });
});

/** Self-revoke: kills this device token permanently. */
deviceRoutes.post("/api/v1/device/revoke", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  await c.env.DB.prepare("UPDATE devices SET revoked_at = ?, token_hash = ? WHERE id = ?")
    .bind(Date.now(), `revoked:${device.id}:${Date.now()}`, device.id)
    .run();

  return c.json({ ok: true, device_id: device.id, revoked: true });
});
