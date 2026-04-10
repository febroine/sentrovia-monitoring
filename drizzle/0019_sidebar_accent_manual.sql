ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS sidebar_accent varchar(24) NOT NULL DEFAULT 'emerald';
