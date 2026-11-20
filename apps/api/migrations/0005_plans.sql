-- Account plan: free (default) | paid. No Stripe yet — set via SQL or PAID_EMAILS.

ALTER TABLE accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
