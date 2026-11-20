import { describe, expect, it } from "vitest";
import { api } from "../helpers";

describe("health", () => {
  it("GET /healthz", async () => {
    const res = await api("/healthz");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, service: "agentdrop-api" });
  });

  it("GET /readyz", async () => {
    const res = await api("/readyz");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; db: boolean };
    expect(json.ok).toBe(true);
    expect(json.db).toBe(true);
  });
});
