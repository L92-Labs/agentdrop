/** Password hashing + unlock cookies for shared artifacts. */

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${pepper}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    material,
    256,
  );
  return `pbkdf2:100000:${b64(salt)}:${b64(bits)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
  pepper: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${pepper}:${password}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    256,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

const COOKIE_PREFIX = "ad_pw_";
const UNLOCK_TTL_MS = 24 * 3600_000;

async function hmac(pepper: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64(sig);
}

export async function mintUnlockCookie(
  artifactId: string,
  pepper: string,
): Promise<{ name: string; value: string; maxAge: number }> {
  const exp = Date.now() + UNLOCK_TTL_MS;
  const payload = `${artifactId}.${exp}`;
  const sig = await hmac(pepper, payload);
  return {
    name: `${COOKIE_PREFIX}${artifactId}`,
    value: `${exp}.${sig}`,
    maxAge: Math.floor(UNLOCK_TTL_MS / 1000),
  };
}

export async function hasValidUnlock(
  cookieHeader: string | undefined,
  artifactId: string,
  pepper: string,
): Promise<boolean> {
  if (!cookieHeader) return false;
  const name = `${COOKIE_PREFIX}${artifactId}=`;
  const part = cookieHeader.split(";").map((s) => s.trim()).find((s) => s.startsWith(name));
  if (!part) return false;
  const value = part.slice(name.length);
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!expStr || !sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmac(pepper, `${artifactId}.${exp}`);
  return sig === expected;
}

export function unlockCookieHeader(cookie: {
  name: string;
  value: string;
  maxAge: number;
}): string {
  return `${cookie.name}=${cookie.value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${cookie.maxAge}`;
}
