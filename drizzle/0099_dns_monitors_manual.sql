ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "dns_expected_values" text,
  ADD COLUMN IF NOT EXISTS "dns_match_mode" varchar(16) DEFAULT 'includes' NOT NULL;
