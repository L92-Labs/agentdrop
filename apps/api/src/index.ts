import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./config";
import { resolveCorsOrigin } from "./config";
import cron from "./cron";
import { errorHandler } from "./errors";
import { logger } from "./logger";
import { skillMarkdown } from "./lib/skill";
import { pageApiDocs, pageError, pageLanding, wantsHtml } from "./lib/ui";
import {
  accessLogMiddleware,
  accessMiddleware,
  configMiddleware,
  deviceMiddleware,
  requestIdMiddleware,
  type AppContext,
} from "./middleware";
import { accountRoutes } from "./routes/account";
import { artifactRoutes } from "./routes/artifacts";
import { deviceRoutes } from "./routes/device";
import { health } from "./routes/health";
import { linkRoutes } from "./routes/link";
import { mcpRoutes } from "./routes/mcp";
import { multipartRoutes } from "./routes/multipart";
import { verifyRoutes } from "./routes/verify";
import { viewerRoutes } from "./routes/viewer";

const app = new Hono<AppContext>();

app.onError(errorHandler);

app.notFound((c) => {
  logger.info(c, "not_found", { method: c.req.method, path: c.req.path });
  if (wantsHtml(c)) {
    return c.html(pageError("Not found", "The page you're looking for doesn't exist.", 404), 404);
  }
  return c.json({ ok: false, error: { code: "not_found", message: "not found" } }, 404);
});

app.use("*", configMiddleware());
app.use("*", requestIdMiddleware());
app.use("*", accessLogMiddleware());
app.use("*", accessMiddleware());
app.use("*", deviceMiddleware());

app.use(
  "*",
  cors({
    origin: (origin, c) => resolveCorsOrigin(c.get("config").corsOrigins, origin),
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  }),
);

app.route("/", health);
app.route("/", deviceRoutes);
app.route("/", artifactRoutes);
app.route("/", multipartRoutes);
app.route("/", viewerRoutes);
app.route("/", linkRoutes);
app.route("/", verifyRoutes);
app.route("/", accountRoutes);
app.route("/", mcpRoutes);

app.get("/skill.md", (c) => {
  const md = skillMarkdown(c.get("config"));
  return c.body(md, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

app.get("/", (c) => c.html(pageLanding(c.get("config").publicBaseUrl, c.get("config").limits)));

app.get("/api", (c) => c.html(pageApiDocs(c.get("config").publicBaseUrl)));

export default {
  fetch: app.fetch,
  scheduled: cron.scheduled,
};

export type { AppEnv };
