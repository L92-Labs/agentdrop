/** Shared record types and transport constants. */
export type Visibility = "public" | "private" | "secret";

export interface ArtifactRecord {
  id: string;
  device_id: string;
  account_id: string | null;
  title: string | null;
  filename: string;
  mime: string;
  size_bytes: number;
  visibility: Visibility;
  share_token: string | null;
  expires_at: number;
  created_at: number;
}

export interface DeviceRecord {
  id: string;
  daily_upload_limit?: number | null;
  account_id: string | null;
  turnstile_verified_at: number | null;
  label: string | null;
  revoked_at: number | null;
  created_at: number;
}

export interface UploadResponse {
  id: string;
  url: string;
  raw_url: string;
  visibility: Visibility;
  expires_at: string;
  mime: string;
  size_bytes: number;
  claimed: boolean;
}

const MB = 1024 * 1024;

/** Fixed transport constants (Cloudflare limits, not policy). Policy limits live in limits.ts. */
export const UPLOAD = {
  /** Single-request body must stay under the Workers ~100MB request limit; larger files use multipart. */
  maxBytesDirectUpload: 95 * MB,
  /** Recommended multipart part size for CLI / agents. */
  multipartPartBytes: 8 * MB,
  /** R2 minimum size for every part except the last. */
  multipartMinPartBytes: 5 * MB,
} as const;
