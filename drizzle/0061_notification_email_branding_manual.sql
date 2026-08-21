ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notification_email_brand_name" varchar(160);

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notification_email_footer_text" varchar(240);
