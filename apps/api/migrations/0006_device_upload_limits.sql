-- Admin-controlled daily upload allowance; NULL keeps the tier default.
ALTER TABLE devices ADD COLUMN daily_upload_limit INTEGER
  CHECK (daily_upload_limit IS NULL OR
    (typeof(daily_upload_limit) = 'integer' AND daily_upload_limit > 0));
