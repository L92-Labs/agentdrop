import { describe, expect, it } from "vitest";
import { api } from "../helpers";

describe("CORS and notFound", () => {
  it("allows configured origin * for healthz", async () => {
    const res = await api("/healthz", {
      headers: { Origin: "https://example.com" },
    });
    expect(res.status).toBe(200);
    // CORS_ORIGINS=* → allow any origin echoed back
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });

  it("OPTIONS preflight returns allow headers", async () => {
    const res = await api("/api/v1/device/status", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });

  it("JSON notFound for API-ish Accept", async () => {
    const res = await api("/no-such-route-xyz", {
      headers: { Accept: "application/json" },
    });
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: false; error: { code: string } };
    expect(json.error.code).toBe("not_found");
  });

  it("HTML notFound for browser Accept", async () => {
    const res = await api("/no-such-route-xyz", {
      headers: { Accept: "text/html" },
    });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Not found");
  });
});
