import { SELF } from "cloudflare:test";

const BASE = "http://localhost";

function b64url(value: unknown): string {
  return bytesB64url(new TextEncoder().encode(JSON.stringify(value)));
}

function bytesB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const TEST_ACCESS_TEAM = "https://test.cloudflareaccess.com";
export const TEST_ACCESS_KID = "test-kid";

let keyPair: Promise<CryptoKeyPair> | null = null;
function testKeyPair(): Promise<CryptoKeyPair> {
  keyPair ??= crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as Promise<CryptoKeyPair>;
  return keyPair;
}

/** JWKS body served for `${TEST_ACCESS_TEAM}/cdn-cgi/access/certs` (see test/setup.ts). */
export async function testAccessCerts(): Promise<{ keys: JsonWebKey[] }> {
  const jwk = (await crypto.subtle.exportKey("jwk", (await testKeyPair()).publicKey)) as JsonWebKey;
  return { keys: [{ ...jwk, kid: TEST_ACCESS_KID, alg: "RS256", use: "sig" } as JsonWebKey] };
}

function claims(sub: string, email: string, aud: string, overrides: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return { sub, email, aud, iss: TEST_ACCESS_TEAM, iat: now, exp: now + 3600, ...overrides };
}

/** Access JWT signed (RS256) with the test key that the stubbed certs endpoint publishes. */
export async function fakeAccessJwt(
  sub = "test-sub",
  email = "test@example.com",
  aud = "test-aud",
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const signingInput = `${b64url({ alg: "RS256", kid: TEST_ACCESS_KID, typ: "JWT" })}.${b64url(
    claims(sub, email, aud, overrides),
  )}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    (await testKeyPair()).privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesB64url(new Uint8Array(sig))}`;
}

/** Forged Access JWT: valid-looking claims, no real signature. Must always be rejected. */
export function unsignedAccessJwt(
  sub = "test-sub",
  email = "test@example.com",
  aud = "test-aud",
): string {
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims(sub, email, aud, {}))}.fake`;
}

export async function api(
  path: string,
  init: RequestInit & { token?: string; accessJwt?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.accessJwt) headers.set("Cf-Access-Jwt-Assertion", init.accessJwt);
  return SELF.fetch(`${BASE}${path}`, { ...init, headers });
}

export async function initDevice(): Promise<{ token: string; deviceId: string }> {
  const res = await api("/api/v1/device/init", { method: "POST" });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { device_token: string; device_id: string };
  return { token: json.device_token, deviceId: json.device_id };
}

/** Minimal valid 1×1 PNG. */
export function tinyPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

export async function uploadArtifact(
  token: string,
  opts: { filename?: string; title?: string; visibility?: string; body?: Uint8Array } = {},
): Promise<Record<string, unknown>> {
  const form = new FormData();
  const bytes = opts.body ?? tinyPng();
  const filename = opts.filename ?? "test.png";
  form.append("file", new File([bytes], filename, { type: "image/png" }));
  if (opts.title) form.append("title", opts.title);
  if (opts.visibility) form.append("visibility", opts.visibility);

  const res = await api("/api/v1/artifacts", { method: "POST", token, body: form });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}
