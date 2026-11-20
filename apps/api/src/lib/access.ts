
interface AccessJwtPayload {
  sub?: string;
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
}

export type AccessAccount = {
  id: string;
  email: string | null;
};

function decodeBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(b64);
}

function base64UrlBytes(input: string): Uint8Array {
  const bin = decodeBase64Url(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode the Access JWT payload. Does NOT verify anything — see verifyAccessJwt. */
export function parseAccessJwt(jwt: string | null): AccessJwtPayload | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]!)) as AccessJwtPayload;
  } catch {
    return null;
  }
}

/** True when the JWT payload's aud claim contains one of the configured AUD tags. */
export function accessAudMatches(payload: AccessJwtPayload, aud: string): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  const allowed = (aud ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) return false;
  const claim = payload.aud;
  if (!claim) return false;
  if (Array.isArray(claim)) return claim.some((a) => allowed.includes(a));
  return allowed.includes(claim);
}

/** Issuer must equal the configured team domain (e.g. https://team.cloudflareaccess.com). */
export function accessIssMatches(payload: AccessJwtPayload, teamDomain: string): boolean {
  const expected = (teamDomain ?? "").replace(/\/$/, "");
  if (!expected) return false;
  if (typeof payload.iss !== "string") return false;
  return payload.iss.replace(/\/$/, "") === expected;
}

type Jwk = JsonWebKey & { kid?: string };

const CERTS_TTL_MS = 10 * 60_000;
/** Minimum gap between forced refetches (unknown kid) — forged tokens must not drive fetches. */
const FORCED_REFETCH_GAP_MS = 60_000;

let certsCache: { url: string; fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;
let lastFetchAt = 0;
let inflight: { url: string; promise: Promise<Map<string, CryptoKey> | null> } | null = null;

/** Test hook: forget cached Access signing keys. */
export function resetAccessKeyCache(): void {
  certsCache = null;
  lastFetchAt = 0;
  inflight = null;
}

async function fetchAccessKeys(url: string): Promise<Map<string, CryptoKey> | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      try {
        keys.set(
          jwk.kid,
          await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
            "verify",
          ]),
        );
      } catch {
        // skip malformed keys
      }
    }
    return keys.size > 0 ? keys : null;
  } catch {
    return null;
  }
}

/**
 * Current signing keys for the team. Fetches at most once per
 * FORCED_REFETCH_GAP_MS (so forged tokens with unknown kids cannot drive
 * outbound requests), shares one in-flight fetch, and never replaces good
 * cached keys with a failed fetch.
 */
async function loadAccessKeys(teamDomain: string, force: boolean): Promise<Map<string, CryptoKey>> {
  const url = `${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`;
  const now = Date.now();
  const cached = certsCache?.url === url ? certsCache : null;
  if (cached && !force && now - cached.fetchedAt < CERTS_TTL_MS) return cached.keys;
  if (!inflight || inflight.url !== url) {
    if (now - lastFetchAt < FORCED_REFETCH_GAP_MS) return cached?.keys ?? new Map();
    lastFetchAt = now;
    const promise = fetchAccessKeys(url).finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
    inflight = { url, promise };
  }
  const keys = await inflight.promise;
  if (keys) {
    certsCache = { url, fetchedAt: Date.now(), keys };
    return keys;
  }
  return cached?.keys ?? new Map();
}

/**
 * Verify the RS256 signature of a Cloudflare Access JWT against the team's
 * published signing keys. Never trust the Cf-Access-Jwt-Assertion header
 * without this: the Worker can be reached on paths (or hostnames, e.g.
 * *.workers.dev) that Access does not protect, where the header is
 * attacker-controlled.
 */
export async function accessSignatureValid(jwt: string, teamDomain: string): Promise<boolean> {
  const [h, p, sig] = jwt.split(".");
  if (!h || !p || !sig) return false;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(decodeBase64Url(h)) as { alg?: string; kid?: string };
  } catch {
    return false;
  }
  if (header.alg !== "RS256" || !header.kid) return false;
  let key = (await loadAccessKeys(teamDomain, false)).get(header.kid);
  if (!key) key = (await loadAccessKeys(teamDomain, true)).get(header.kid); // key rotation
  if (!key) return false;
  try {
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlBytes(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
  } catch {
    return false;
  }
}

/** Reject expired / not-yet-valid tokens. */
export function accessTimeValid(payload: AccessJwtPayload, now = Date.now()): boolean {
  const skewMs = 60_000;
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now - skewMs) return false;
  if (typeof payload.nbf === "number" && payload.nbf * 1000 > now + skewMs) return false;
  return true;
}

export async function getAccountFromAccess(
  db: D1Database,
  jwt: string | null,
  aud: string,
  teamDomain = "",
): Promise<AccessAccount | null> {
  // Access login is disabled unless both the team domain and AUD are configured.
  if (!jwt || !teamDomain || !aud) return null;
  const payload = parseAccessJwt(jwt);
  if (typeof payload !== "object" || payload === null || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }
  if (!accessAudMatches(payload, aud)) return null;
  if (!accessIssMatches(payload, teamDomain)) return null;
  if (!accessTimeValid(payload)) return null;
  if (!(await accessSignatureValid(jwt, teamDomain))) return null;

  const existing = await db
    .prepare("SELECT id, email FROM accounts WHERE access_sub = ?")
    .bind(payload.sub)
    .first<{ id: string; email: string | null }>();

  if (existing) {
    const email = payload.email ?? existing.email;
    if (payload.email && existing.email !== payload.email) {
      await db.prepare("UPDATE accounts SET email = ? WHERE id = ?").bind(email, existing.id).run();
    }
    return { id: existing.id, email };
  }

  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO accounts (id, email, access_sub, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, payload.email ?? null, payload.sub, Date.now())
    .run();

  return { id, email: payload.email ?? null };
}
