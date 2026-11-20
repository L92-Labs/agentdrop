import { describe, expect, it } from "vitest";
import {
  deviceToken,
  expiresAt,
  hashToken,
  iso,
  linkCode,
  randomId,
} from "../../src/lib/ids";

describe("ids", () => {
  it("randomId uses prefix and expected length", () => {
    const id = randomId("art_", 10);
    expect(id.startsWith("art_")).toBe(true);
    expect(id.length).toBe(4 + 10);
  });

  it("linkCode matches XXXX-XXXX format", () => {
    const code = linkCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("deviceToken starts with dev_", () => {
    expect(deviceToken().startsWith("dev_")).toBe(true);
  });

  it("hashToken is deterministic", async () => {
    const a = await hashToken("dev_abc", "pepper");
    const b = await hashToken("dev_abc", "pepper");
    const c = await hashToken("dev_xyz", "pepper");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expiresAt adds days in ms", () => {
    const before = Date.now();
    const exp = expiresAt(7);
    expect(exp).toBeGreaterThanOrEqual(before + 7 * 86_400_000 - 1000);
    expect(exp).toBeLessThanOrEqual(before + 7 * 86_400_000 + 1000);
  });

  it("iso formats UTC", () => {
    expect(iso(0)).toBe("1970-01-01T00:00:00.000Z");
  });
});
