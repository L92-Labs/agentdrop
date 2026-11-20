-- Lifecycle: revoke, secret shares, keep indexes in sync after table rebuild.

ALTER TABLE devices ADD COLUMN revoked_at INTEGER;

CREATE TABLE artifacts_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(id),
  account_id TEXT REFERENCES accounts(id),
  title TEXT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'secret')),
  share_token TEXT UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

INSERT INTO artifacts_v2 (
  id, device_id, account_id, title, filename, mime, size_bytes, r2_key, visibility, share_token, expires_at, created_at
)
SELECT
  id, device_id, account_id, title, filename, mime, size_bytes, r2_key, visibility, NULL, expires_at, created_at
FROM artifacts;

DROP TABLE artifacts;
ALTER TABLE artifacts_v2 RENAME TO artifacts;

CREATE INDEX IF NOT EXISTS idx_artifacts_device ON artifacts(device_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_account ON artifacts(account_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires ON artifacts(expires_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_share ON artifacts(share_token);
