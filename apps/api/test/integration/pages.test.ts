import { describe, expect, it } from "vitest";
import { api } from "../helpers";

describe("HTML pages", () => {
  it("GET / returns landing HTML", async () => {
    const res = await api("/", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("agentdrop");
    expect(html).toContain("Set up this machine");
  });

  it("GET /api returns API docs HTML", async () => {
    const res = await api("/api", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("API reference");
    expect(html).toContain("/api/v1/artifacts");
  });

  it("GET /skill.md returns markdown", async () => {
    const res = await api("/skill.md");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const md = await res.text();
    expect(md).toMatch(/^---\nname: agentdrop/);
  });

  it("GET / serves HTML even when Accept is JSON (browser-first route)", async () => {
    const res = await api("/", { headers: { Accept: "application/json" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("GET /dashboard requires Access", async () => {
    const res = await api("/dashboard", { headers: { Accept: "text/html" } });
    expect(res.status).toBe(401);
  });
});
