-- Optional password gate on shared artifacts.

ALTER TABLE artifacts ADD COLUMN password_hash TEXT;
ALTER TABLE multipart_uploads ADD COLUMN password_hash TEXT;
