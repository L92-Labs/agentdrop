import type { DeviceRecord } from "../shared";
import { hashToken } from "./ids";

export async function resolveDevice(
  db: D1Database,
  bearer: string | null,
  pepper: string,
): Promise<(DeviceRecord & { token: string }) | null> {
  if (!bearer?.startsWith("dev_")) return null;
  const tokenHash = await hashToken(bearer, pepper);
  const row = await db
    .prepare(
      "SELECT id, account_id, turnstile_verified_at, label, revoked_at, created_at, daily_upload_limit FROM devices WHERE token_hash = ?",
    )
    .bind(tokenHash)
    .first<DeviceRecord>();

  if (!row || row.revoked_at) return null;
  return { ...row, token: bearer };
}

export function bearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

const BLOCKED_MIME = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/vnd.microsoft.portable-executable",
  "application/x-msdos-program",
  "application/x-sh",
]);

const BLOCKED_EXT = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".ps1",
  ".dll",
  ".so",
  ".dylib",
]);

/** Common agent-output extensions → MIME when upload omits Content-Type. */
const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".htm": "text/html",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".toml": "application/toml",
  ".js": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".jsx": "text/plain",
  ".css": "text/css",
  ".py": "text/x-python",
  ".rs": "text/plain",
  ".go": "text/plain",
  ".sh": "text/x-shellscript",
  ".log": "text/plain",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".tgz": "application/gzip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".parquet": "application/vnd.apache.parquet",
  ".sqlite": "application/x-sqlite3",
  ".db": "application/x-sqlite3",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

/**
 * Allow any agent-produced file except known-dangerous executables.
 * Infers MIME from extension when the client sends empty / octet-stream.
 */
export function sanitizeMime(mime: string, filename: string): string | null {
  const lower = filename.toLowerCase();
  const ext = extOf(lower);
  if (BLOCKED_EXT.has(ext)) return null;

  let m = (mime || "").split(";")[0]!.trim().toLowerCase();
  if (!m || m === "application/octet-stream") {
    m = EXT_MIME[ext] ?? "application/octet-stream";
  }
  if (BLOCKED_MIME.has(m)) return null;
  return m;
}

export function artifactUrls(
  base: string,
  id: string,
  filename: string,
  opts: { shareToken?: string | null } = {},
) {
  const enc = encodeURIComponent(filename);
  const secretQs = opts.shareToken ? `?s=${encodeURIComponent(opts.shareToken)}` : "";
  return {
    url: `${base}/a/${id}${secretQs}`,
    raw_url: `${base}/r/${id}/${enc}${secretQs}`,
  };
}

export interface Usage {
  bytes: number;
  count: number;
}

/** Active (unexpired) usage of an account. */
export async function accountUsage(db: D1Database, accountId: string): Promise<Usage> {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS count FROM artifacts WHERE account_id = ? AND expires_at > ?",
    )
    .bind(accountId, Date.now())
    .first<{ bytes: number; count: number }>();
  return { bytes: Number(row?.bytes ?? 0), count: Number(row?.count ?? 0) };
}

/** Active usage of whoever owns a device's uploads: its account if linked, else the device. */
export async function ownerUsage(db: D1Database, device: DeviceRecord): Promise<Usage> {
  if (device.account_id) return accountUsage(db, device.account_id);
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS count FROM artifacts WHERE device_id = ? AND account_id IS NULL AND expires_at > ?",
    )
    .bind(device.id, Date.now())
    .first<{ bytes: number; count: number }>();
  return { bytes: Number(row?.bytes ?? 0), count: Number(row?.count ?? 0) };
}

/** Active storage across the whole instance. */
export async function totalStorageUsed(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM artifacts WHERE expires_at > ?")
    .bind(Date.now())
    .first<{ bytes: number }>();
  return Number(row?.bytes ?? 0);
}

/** `max` of 0 means unlimited. */
export function withinLimit(used: number, incoming: number, max: number): boolean {
  return max === 0 || used + incoming <= max;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
