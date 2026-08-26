ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS default_telegram_bot_token_encrypted text,
  ADD COLUMN IF NOT EXISTS default_telegram_chat_id varchar(120);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS notification_email_recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS telegram_bot_token_encrypted text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id varchar(120);
