import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { hashToken } from "../../src/lib/ids";
import { bearerToken, resolveDevice } from "../../src/lib/device";

describe("resolveDevice", () => {
  it("resolves device from bearer token", async () => {
    const token = "dev_testtoken123456789012345";
    const tokenHash = await hashToken(token, env.TOKEN_PEPPER);
    await env.DB.prepare(
      "INSERT INTO devices (id, token_hash, created_at) VALUES (?, ?, ?)",
    )
      .bind("dvc_testresolve", tokenHash, Date.now())
      .run();

    const device = await resolveDevice(env.DB, token, env.TOKEN_PEPPER);
    expect(device?.id).toBe("dvc_testresolve");
    expect(device?.token).toBe(token);
  });

  it("returns null for invalid token prefix", async () => {
    expect(await resolveDevice(env.DB, "bad_token", env.TOKEN_PEPPER)).toBeNull();
    expect(bearerToken("Token dev_x")).toBeNull();
  });
});
