import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  accessAudMatches,
  accessIssMatches,
  accessTimeValid,
  getAccountFromAccess,
  parseAccessJwt,
  resetAccessKeyCache,
} from "../../src/lib/access";
import { api, fakeAccessJwt, initDevice, unsignedAccessJwt } from "../helpers";

describe("access", () => {
  it("parseAccessJwt decodes payload", async () => {
    const jwt = await fakeAccessJwt("sub-1", "user@test.com", "test-aud");
    const payload = parseAccessJwt(jwt);
    expect(payload?.sub).toBe("sub-1");
    expect(payload?.email).toBe("user@test.com");
    expect(payload?.aud).toBe("test-aud");
    expect(payload?.iss).toBe("https://test.cloudflareaccess.com");
  });

  it("parseAccessJwt returns null for garbage", () => {
    expect(parseAccessJwt(null)).toBeNull();
    expect(parseAccessJwt("not-a-jwt")).toBeNull();
    expect(parseAccessJwt("a.%%%notb64%%%.c")).toBeNull();
    expect(parseAccessJwt(`a.${btoa("not-json")}.c`)).toBeNull();
  });

  it("accessAudMatches accepts configured aud", () => {
    expect(accessAudMatches({ aud: "test-aud" }, "test-aud")).toBe(true);
    expect(accessAudMatches({ aud: ["other", "test-aud"] }, "test-aud,other")).toBe(true);
    expect(accessAudMatches({ aud: "wrong" }, "test-aud")).toBe(false);
  });

  it("accessAudMatches rejects missing aud claim when configured", () => {
    expect(accessAudMatches({}, "test-aud")).toBe(false);
  });

  it("accessAudMatches fails closed when no aud is configured", () => {
    expect(accessAudMatches({ aud: "anything" }, "")).toBe(false);
  });

  it("accessIssMatches enforces team domain", () => {
    expect(
      accessIssMatches({ iss: "https://test.cloudflareaccess.com" }, "https://test.cloudflareaccess.com"),
    ).toBe(true);
    expect(accessIssMatches({ iss: "https://evil.example" }, "https://test.cloudflareaccess.com")).toBe(
      false,
    );
    expect(accessIssMatches({ iss: "https://x.com" }, "")).toBe(false);
  });

  it("accessTimeValid rejects expired and not-yet-valid tokens", () => {
    const now = Date.now();
    expect(accessTimeValid({ exp: Math.floor(now / 1000) + 60 }, now)).toBe(true);
    expect(accessTimeValid({ exp: Math.floor(now / 1000) - 120 }, now)).toBe(false);
    expect(accessTimeValid({ nbf: Math.floor(now / 1000) + 120 }, now)).toBe(false);
  });

  it("getAccountFromAccess rejects bad aud/iss/exp and missing sub", async () => {
    const team = "https://test.cloudflareaccess.com";
    expect(await getAccountFromAccess(env.DB, null, "test-aud", team)).toBeNull();
    expect(
      await getAccountFromAccess(env.DB, await fakeAccessJwt("s", "e@t.com", "wrong-aud"), "test-aud", team),
    ).toBeNull();
    expect(
      await getAccountFromAccess(
        env.DB,
        await fakeAccessJwt("s", "e@t.com", "test-aud", { iss: "https://evil.example" }),
        "test-aud",
        team,
      ),
    ).toBeNull();
    expect(
      await getAccountFromAccess(
        env.DB,
        await fakeAccessJwt("s", "e@t.com", "test-aud", { exp: Math.floor(Date.now() / 1000) - 120 }),
        "test-aud",
        team,
      ),
    ).toBeNull();
    expect(
      await getAccountFromAccess(
        env.DB,
        await fakeAccessJwt("", "e@t.com", "test-aud", { sub: undefined }),
        "test-aud",
        team,
      ),
    ).toBeNull();
  });

  it("getAccountFromAccess creates account and updates email", async () => {
    const team = "https://test.cloudflareaccess.com";
    const jwt1 = await fakeAccessJwt("upsert-sub", "one@test.com");
    const a1 = await getAccountFromAccess(env.DB, jwt1, "test-aud", team);
    expect(a1?.email).toBe("one@test.com");

    const jwt2 = await fakeAccessJwt("upsert-sub", "two@test.com");
    const a2 = await getAccountFromAccess(env.DB, jwt2, "test-aud", team);
    expect(a2?.id).toBe(a1?.id);
    expect(a2?.email).toBe("two@test.com");
  });

  it("middleware rejects Access JWT with wrong aud on dashboard", async () => {
    const bad = await fakeAccessJwt("bad-aud-sub", "bad@test.com", "not-the-aud");
    const res = await api("/dashboard", { accessJwt: bad, headers: { Accept: "text/html" } });
    expect(res.status).toBe(401);
  });

  it("getAccountFromAccess rejects forged (unsigned) tokens", async () => {
    const team = "https://test.cloudflareaccess.com";
    const forged = unsignedAccessJwt("forged-sub", "paid@test.com");
    expect(await getAccountFromAccess(env.DB, forged, "test-aud", team)).toBeNull();
    // Valid header/payload with a signature from a different token.
    const real = await fakeAccessJwt("real-sub", "real@test.com");
    const other = await fakeAccessJwt("other-sub", "paid@test.com");
    const spliced = `${other.split(".").slice(0, 2).join(".")}.${real.split(".")[2]}`;
    expect(await getAccountFromAccess(env.DB, spliced, "test-aud", team)).toBeNull();
  });

  it("getAccountFromAccess is disabled when team domain or aud is unset", async () => {
    const jwt = await fakeAccessJwt("cfg-sub", "cfg@test.com");
    expect(await getAccountFromAccess(env.DB, jwt, "", "https://test.cloudflareaccess.com")).toBeNull();
    expect(await getAccountFromAccess(env.DB, jwt, "test-aud", "")).toBeNull();
  });

  it("getAccountFromAccess rejects unknown kid and unreachable certs", async () => {
    const team = "https://test.cloudflareaccess.com";
    const jwt = await fakeAccessJwt("kid-sub", "kid@test.com");
    const [, p, sig] = jwt.split(".");
    const header = btoa(JSON.stringify({ alg: "RS256", kid: "nope" })).replace(/=+$/, "");
    expect(await getAccountFromAccess(env.DB, `${header}.${p}.${sig}`, "test-aud", team)).toBeNull();

    resetAccessKeyCache();
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect(await getAccountFromAccess(env.DB, jwt, "test-aud", team)).toBeNull();
    resetAccessKeyCache();
  });

  it("forged Access header cannot reach the account API", async () => {
    const forged = unsignedAccessJwt("forged-api", "paid@test.com");
    const res = await api("/api/v1/account", { accessJwt: forged });
    expect(res.status).toBe(401);

    const { token } = await initDevice();
    const start = await api("/api/v1/link/start", { method: "POST", token });
    const { link_code } = (await start.json()) as { link_code: string };
    const approve = await api(`/link/${link_code}`, { method: "POST", accessJwt: forged });
    expect(approve.status).not.toBe(200);
    const status = (await (await api("/api/v1/device/status", { token })).json()) as { claimed?: boolean };
    expect(status.claimed).not.toBe(true);
  });

  it("unknown kids cannot drive certs fetches, and a failed refetch keeps good keys", async () => {
    const team = "https://test.cloudflareaccess.com";
    resetAccessKeyCache();
    const good = await fakeAccessJwt("cache-sub", "cache@test.com");
    expect(await getAccountFromAccess(env.DB, good, "test-aud", team)).not.toBeNull();

    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("rate limited", { status: 429 });
    });
    const [, p, sig] = good.split(".");
    for (let i = 0; i < 20; i++) {
      const header = btoa(JSON.stringify({ alg: "RS256", kid: `rand-${i}` })).replace(/=+$/, "");
      expect(await getAccountFromAccess(env.DB, `${header}.${p}.${sig}`, "test-aud", team)).toBeNull();
    }
    expect(calls).toBeLessThanOrEqual(1);
    // Real users still log in with the cached keys.
    expect(await getAccountFromAccess(env.DB, good, "test-aud", team)).not.toBeNull();
    resetAccessKeyCache();
  });

  it("malformed claims and network errors reject instead of throwing", async () => {
    const team = "https://test.cloudflareaccess.com";
    const bad = await fakeAccessJwt("iss-sub", "iss@test.com", "test-aud", { iss: 123 });
    expect(await getAccountFromAccess(env.DB, bad, "test-aud", team)).toBeNull();
    const noExp = await fakeAccessJwt("noexp-sub", "noexp@test.com", "test-aud", { exp: undefined });
    expect(await getAccountFromAccess(env.DB, noExp, "test-aud", team)).toBeNull();

    resetAccessKeyCache();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const ok = await fakeAccessJwt("net-sub", "net@test.com");
    expect(await getAccountFromAccess(env.DB, ok, "test-aud", team)).toBeNull();
    resetAccessKeyCache();
  });
});
