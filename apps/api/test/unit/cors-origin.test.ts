import { describe, expect, it } from "vitest";
import { resolveCorsOrigin } from "../../src/config";

describe("resolveCorsOrigin", () => {
  it("returns * when Origin missing", () => {
    expect(resolveCorsOrigin(new Set(["https://a.com"]), undefined)).toBe("*");
  });

  it("echoes origin when allow-list is *", () => {
    expect(resolveCorsOrigin(new Set(["*"]), "https://example.com")).toBe("https://example.com");
  });

  it("echoes allowed origin and denies others", () => {
    const allowed = new Set(["https://a.com"]);
    expect(resolveCorsOrigin(allowed, "https://a.com")).toBe("https://a.com");
    expect(resolveCorsOrigin(allowed, "https://evil.com")).toBe("");
  });
});
