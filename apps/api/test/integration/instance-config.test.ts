import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index";
import { tinyPng } from "../helpers";

/** Call the Worker with env overrides (instance configuration). */
async function call(path: string, overrides: Record<string, string>, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://drop.test${path}`, init), { ...env, ...overrides } as never, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const NO_ACCESS = { CF_ACCESS_TEAM_DOMAIN: "", CF_ACCESS_AUD: "", PUBLIC_BASE_URL: "" };

describe("instance configuration", () => {
  it("ENROLL_TOKEN makes device creation private", async () => {
    const denied = await call("/api/v1/device/init", { ENROLL_TOKEN: "s3cret" }, { method: "POST" });
    expect(denied.status).toBe(401);
    expect(((await denied.json()) as { error: string }).error).toBe("enroll_token_required");

    const wrong = await call("/api/v1/device/init", { ENROLL_TOKEN: "s3cret" }, {
      method: "POST",
      headers: { "X-Enroll-Token": "nope" },
    });
    expect(wrong.status).toBe(401);

    const ok = await call("/api/v1/device/init", { ENROLL_TOKEN: "s3cret" }, {
      method: "POST",
      headers: { "X-Enroll-Token": "s3cret" },
    });
    expect(ok.status).toBe(200);
  });

  it("without Access: no dashboard or linking, but secret links work", async () => {
    const dash = await call("/dashboard", NO_ACCESS, { headers: { Accept: "text/html" } });
    expect(dash.status).toBe(404);
    expect(await dash.text()).toContain("Dashboard not enabled");

    const init = await call("/api/v1/device/init", NO_ACCESS, { method: "POST" });
    const { device_token } = (await init.json()) as { device_token: string };
    const auth = { Authorization: `Bearer ${device_token}` };

    const link = await call("/api/v1/link/start", NO_ACCESS, { method: "POST", headers: auth });
    expect(link.status).toBe(404);

    const form = new FormData();
    form.append("file", new Blob([tinyPng()], { type: "image/png" }), "s.png");
    form.append("visibility", "secret");
    const up = await call("/api/v1/artifacts", NO_ACCESS, { method: "POST", headers: auth, body: form });
    expect(up.status).toBe(200);
    const json = (await up.json()) as { visibility: string; url: string };
    expect(json.visibility).toBe("secret");
    expect(json.url).toMatch(/^http:\/\/drop\.test\/a\/art_.+\?s=/);
  });

  it("links fall back to the request origin when PUBLIC_BASE_URL is empty", async () => {
    const skill = await call("/skill.md", { PUBLIC_BASE_URL: "", MAX_FILE_MB: "42" });
    const md = await skill.text();
    expect(md).toContain("**Base URL:** http://drop.test");
    expect(md).toContain("Max file: **42MB**");
  });

  it("verify routes are off without Turnstile", async () => {
    const res = await call("/verify/dvc_x", { TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "" });
    expect(res.status).toBe(404);
  });

  it("refuses to serve without TOKEN_PEPPER, except /healthz", async () => {
    expect((await call("/api/v1/device/init", { TOKEN_PEPPER: " " }, { method: "POST" })).status).toBe(503);
    expect((await call("/healthz", { TOKEN_PEPPER: "" })).status).toBe(200);
  });

  it("status reports configured limits and usage", async () => {
    const init = await call("/api/v1/device/init", {}, { method: "POST" });
    const { device_token } = (await init.json()) as { device_token: string };
    const res = await call("/api/v1/device/status", { MAX_ARTIFACTS: "3", MAX_STORAGE_MB: "0" }, {
      headers: { Authorization: `Bearer ${device_token}` },
    });
    const json = (await res.json()) as {
      limits: { max_artifacts: number; max_bytes_storage_label: string };
      storage: { artifacts: number };
    };
    expect(json.limits.max_artifacts).toBe(3);
    expect(json.limits.max_bytes_storage_label).toBe("unlimited");
    expect(json.storage.artifacts).toBe(0);
  });
});
