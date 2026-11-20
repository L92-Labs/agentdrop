import { describe, expect, it } from "vitest";
import {
  formatExpiresIn,
  parseExpires,
  resolvePatchExpires,
  resolveRetentionDays,
} from "../../src/lib/expiry";

describe("expiry", () => {
  it("parseExpires accepts hours and days", () => {
    expect(parseExpires("24h")).toBe(1);
    expect(parseExpires("7d")).toBe(7);
    expect(parseExpires("30")).toBe(30);
    expect(parseExpires("bad")).toBeNull();
  });

  it("formatExpiresIn is relative", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(formatExpiresIn(now + 2 * 3600_000, now)).toBe("in 2h");
    expect(formatExpiresIn(now + 3 * 86_400_000, now)).toBe("in 3 days");
    expect(formatExpiresIn(now - 1000, now)).toBe("expired");
  });

  it("resolveRetentionDays only customizes claimed devices", () => {
    expect(
      resolveRetentionDays({
        claimed: false,
        defaultDays: 7,
        expiresRaw: "24h",
      }),
    ).toBe(7);
    expect(
      resolveRetentionDays({
        claimed: true,
        defaultDays: 30,
        expiresRaw: "24h",
      }),
    ).toBe(1);
  });

  it("resolvePatchExpires accepts now and relative TTLs", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(resolvePatchExpires("now", now)).toEqual({ ok: true, expiresAt: now });
    expect(resolvePatchExpires("0", now)).toEqual({ ok: true, expiresAt: now });
    expect(resolvePatchExpires("7d", now)).toEqual({
      ok: true,
      expiresAt: now + 7 * 86_400_000,
    });
    expect(resolvePatchExpires("24h", now)).toEqual({
      ok: true,
      expiresAt: now + 86_400_000,
    });
    expect(resolvePatchExpires("")).toEqual({ ok: false, error: "expires_required" });
    expect(resolvePatchExpires("nope")).toEqual({ ok: false, error: "invalid_expires" });
  });
});
