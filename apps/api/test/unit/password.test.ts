import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, mintUnlockCookie, hasValidUnlock } from "../../src/lib/password";

describe("password", () => {
  it("hashes and verifies", async () => {
    const stored = await hashPassword("s3cret", "pepper");
    expect(stored.startsWith("pbkdf2:")).toBe(true);
    expect(await verifyPassword("s3cret", stored, "pepper")).toBe(true);
    expect(await verifyPassword("nope", stored, "pepper")).toBe(false);
  });

  it("mintUnlockCookie round-trips", async () => {
    const cookie = await mintUnlockCookie("art_x", "pepper");
    const header = `${cookie.name}=${cookie.value}`;
    expect(await hasValidUnlock(header, "art_x", "pepper")).toBe(true);
    expect(await hasValidUnlock(header, "art_other", "pepper")).toBe(false);
  });
});
