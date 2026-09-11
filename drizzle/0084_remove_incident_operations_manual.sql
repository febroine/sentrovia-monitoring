DROP TABLE IF EXISTS public.incident_updates;
DROP TABLE IF EXISTS public.maintenance_windows;

ALTER TABLE public.monitor_outages
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS acknowledged_by_user_id,
  DROP COLUMN IF EXISTS assigned_to_user_id,
  DROP COLUMN IF EXISTS escalation_level;
