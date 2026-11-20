-- Multipart upload sessions for files up to 1GB (Workers body is ~100MB).

CREATE TABLE IF NOT EXISTS multipart_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  account_id TEXT REFERENCES accounts(id),
  r2_key TEXT NOT NULL,
  r2_upload_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  title TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  share_token TEXT,
  size_bytes INTEGER NOT NULL,
  retention_days INTEGER NOT NULL,
  parts_json TEXT NOT NULL DEFAULT '[]',
  rate_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_multipart_device ON multipart_uploads(device_id);
CREATE INDEX IF NOT EXISTS idx_multipart_expires ON multipart_uploads(expires_at);
