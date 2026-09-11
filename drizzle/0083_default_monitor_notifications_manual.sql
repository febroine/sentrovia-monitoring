ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS default_monitor_notification_pref varchar(16) NOT NULL DEFAULT 'both';

UPDATE public.user_settings
SET default_monitor_notification_pref = 'both'
WHERE default_monitor_notification_pref NOT IN ('email', 'telegram', 'both', 'none');

ALTER TABLE public.monitors
  ALTER COLUMN notification_pref SET DEFAULT 'both',
  ALTER COLUMN publish_on_status_page SET DEFAULT true;
