import { describe, expect, it } from "vitest";
import { api, initDevice } from "../helpers";

describe("device API", () => {
  it("POST /api/v1/device/init issues token", async () => {
    const { token, deviceId } = await initDevice();
    expect(token.startsWith("dev_")).toBe(true);
    expect(deviceId.startsWith("dvc_")).toBe(true);
  });

  it("GET /api/v1/device/status requires auth", async () => {
    const res = await api("/api/v1/device/status");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/device/status returns tier for token", async () => {
    const { token, deviceId } = await initDevice();
    const res = await api("/api/v1/device/status", { token });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.device_id).toBe(deviceId);
    expect(json.tier).toBe("cold");
    expect(json.claimed).toBe(false);
    expect(String(json.verify_url)).toContain(deviceId);
  });
});
