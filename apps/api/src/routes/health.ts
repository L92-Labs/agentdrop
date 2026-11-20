import { Hono } from "hono";
import type { AppEnv } from "../config";
import type { AppContext } from "../middleware";

export const health = new Hono<AppContext>();

health.get("/healthz", (c) => c.json({ ok: true, service: "agentdrop-api" }));
health.get("/readyz", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true, db: true });
  } catch {
    return c.json({ ok: false, db: false }, 503);
  }
});

export type { AppEnv };
