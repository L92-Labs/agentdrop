import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS as L, loadLimits } from "../../src/limits";
import { limitForTier, resolveTier, windowKey } from "../../src/lib/rate-limit";

describe("rate-limit", () => {
  const now = 1_700_000_000_000;

  it("resolveTier returns claimed when account linked", () => {
    expect(resolveTier({ tier: "cold", accountId: "acc_1", turnstileVerifiedAt: null }, L, now)).toBe(
      "claimed",
    );
  });

  it("resolveTier returns verified when turnstile fresh", () => {
    expect(
      resolveTier({ tier: "cold", accountId: null, turnstileVerifiedAt: now - 86_400_000 }, L, now),
    ).toBe("verified");
  });

  it("resolveTier returns cold when unverified", () => {
    expect(resolveTier({ tier: "cold", accountId: null, turnstileVerifiedAt: null }, L, now)).toBe("cold");
  });

  it("windowKey uses hour bucket for cold tier", () => {
    const hour = Math.floor(now / 3_600_000);
    expect(windowKey("cold", "dvc_1", now)).toBe(`rate:dvc_1:hour:${hour}`);
  });

  it("windowKey uses day bucket for verified tier", () => {
    const day = Math.floor(now / 86_400_000);
    expect(windowKey("verified", "dvc_1", now)).toBe(`rate:dvc_1:day:${day}`);
  });

  it("limitForTier reads the configured limits", () => {
    expect(limitForTier("cold", L)).toBe(5);
    expect(limitForTier("verified", L)).toBe(30);
    expect(limitForTier("claimed", L)).toBe(200);
    const custom = loadLimits({ UPLOADS_PER_HOUR: "0", UPLOADS_PER_DAY_VERIFIED: "7", UPLOADS_PER_DAY_LINKED: "9" });
    expect(limitForTier("cold", custom)).toBe(0);
    expect(limitForTier("verified", custom)).toBe(7);
    expect(limitForTier("claimed", custom)).toBe(9);
  });

  it("applies a valid override only to claimed devices", () => {
    expect(limitForTier("claimed", L, 1000)).toBe(1000);
    expect(limitForTier("cold", L, 1000)).toBe(L.uploadsPerHour);
    expect(limitForTier("verified", L, 1000)).toBe(L.uploadsPerDayVerified);
    for (const invalid of [null, 0, -1, 1.5, NaN, Infinity]) {
      expect(limitForTier("claimed", L, invalid)).toBe(L.uploadsPerDayLinked);
    }
  });
});
