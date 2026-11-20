import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../../src/lib/turnstile-core";

describe("turnstile-core", () => {
  it("verifyTurnstile returns true on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true })),
    );
    const ok = await verifyTurnstile("secret", "token", "1.2.3.4");
    expect(ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it("verifyTurnstile returns false on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: false })),
    );
    const ok = await verifyTurnstile("secret", "token");
    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it("verifyTurnstile returns false when siteverify HTTP fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const ok = await verifyTurnstile("secret", "token");
    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });
});
