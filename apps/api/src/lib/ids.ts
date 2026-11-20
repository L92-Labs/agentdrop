const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomId(prefix: string, bytes = 12): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  let out = prefix;
  for (let i = 0; i < bytes; i++) {
    out += ALPHABET[raw[i]! % ALPHABET.length];
  }
  return out;
}

export function linkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = crypto.getRandomValues(new Uint8Array(8));
  let a = "";
  let b = "";
  for (let i = 0; i < 4; i++) a += chars[raw[i]! % chars.length];
  for (let i = 4; i < 8; i++) b += chars[raw[i]! % chars.length];
  return `${a}-${b}`;
}

export async function hashToken(token: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function deviceToken(): string {
  return randomId("dev_", 24);
}

export function expiresAt(days: number): number {
  return Date.now() + days * 86_400_000;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}
