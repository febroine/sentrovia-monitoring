DO $$
DECLARE
  legacy_outage_count bigint;
  legacy_event_count bigint;
BEGIN
  IF to_regclass('public.monitor_incidents') IS NOT NULL
     AND to_regclass('public.monitor_outages') IS NOT NULL THEN
    SELECT count(*) INTO legacy_outage_count FROM monitor_incidents;
    IF legacy_outage_count > 0 THEN
      RAISE EXCEPTION 'Both monitor_incidents and monitor_outages contain a schema. Refusing to discard % legacy outage rows.', legacy_outage_count;
    END IF;

    IF to_regclass('public.incident_events') IS NOT NULL THEN
      SELECT count(*) INTO legacy_event_count FROM incident_events;
      IF legacy_event_count > 0 THEN
        RAISE EXCEPTION 'Both outage schemas exist. Refusing to discard % legacy outage event rows.', legacy_event_count;
      END IF;
    END IF;

    DROP TABLE IF EXISTS incident_events;
    DROP TABLE monitor_incidents;
  ELSIF to_regclass('public.monitor_incidents') IS NOT NULL THEN
    ALTER TABLE monitor_incidents RENAME TO monitor_outages;
  END IF;
END $$;

DO $$
DECLARE
  legacy_event_count bigint;
BEGIN
  IF to_regclass('public.incident_events') IS NOT NULL
     AND to_regclass('public.outage_events') IS NOT NULL THEN
    SELECT count(*) INTO legacy_event_count FROM incident_events;
    IF legacy_event_count > 0 THEN
      RAISE EXCEPTION 'Both incident_events and outage_events contain a schema. Refusing to discard % legacy outage event rows.', legacy_event_count;
    END IF;

    DROP TABLE incident_events;
  ELSIF to_regclass('public.incident_events') IS NOT NULL THEN
    ALTER TABLE incident_events RENAME TO outage_events;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'outage_events' AND column_name = 'incident_id'
  ) THEN
    ALTER TABLE outage_events RENAME COLUMN incident_id TO outage_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'show_incident_banner'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_settings' AND column_name = 'show_outage_banner'
    ) THEN
      UPDATE user_settings SET show_outage_banner = show_incident_banner;
      ALTER TABLE user_settings DROP COLUMN show_incident_banner;
    ELSE
      ALTER TABLE user_settings RENAME COLUMN show_incident_banner TO show_outage_banner;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'monitors' AND column_name = 'send_incident_screenshot'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'monitors' AND column_name = 'send_outage_screenshot'
    ) THEN
      UPDATE monitors SET send_outage_screenshot = send_incident_screenshot;
      ALTER TABLE monitors DROP COLUMN send_incident_screenshot;
    ELSE
      ALTER TABLE monitors RENAME COLUMN send_incident_screenshot TO send_outage_screenshot;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report_schedules' AND column_name = 'include_incident_summary'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'report_schedules' AND column_name = 'include_outage_summary'
    ) THEN
      UPDATE report_schedules SET include_outage_summary = include_incident_summary;
      ALTER TABLE report_schedules DROP COLUMN include_incident_summary;
    ELSE
      ALTER TABLE report_schedules RENAME COLUMN include_incident_summary TO include_outage_summary;
    END IF;
  END IF;
END $$;

ALTER TABLE IF EXISTS monitor_outages
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS postmortem,
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS acknowledged_by,
  DROP COLUMN IF EXISTS acknowledgement_note;

ALTER TABLE IF EXISTS report_schedules
  DROP COLUMN IF EXISTS attach_csv,
  DROP COLUMN IF EXISTS attach_html,
  DROP COLUMN IF EXISTS attach_pdf;

ALTER INDEX IF EXISTS monitor_incidents_user_status_started_idx
  RENAME TO monitor_outages_user_status_started_idx;

ALTER INDEX IF EXISTS incident_events_user_monitor_created_idx
  RENAME TO outage_events_user_monitor_created_idx;

ALTER INDEX IF EXISTS incident_events_incident_created_idx
  RENAME TO outage_events_outage_created_idx;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monitor_incidents_pkey') THEN
    ALTER TABLE monitor_outages RENAME CONSTRAINT monitor_incidents_pkey TO monitor_outages_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monitor_incidents_monitor_id_fkey') THEN
    ALTER TABLE monitor_outages RENAME CONSTRAINT monitor_incidents_monitor_id_fkey TO monitor_outages_monitor_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monitor_incidents_user_id_fkey') THEN
    ALTER TABLE monitor_outages RENAME CONSTRAINT monitor_incidents_user_id_fkey TO monitor_outages_user_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_events_pkey') THEN
    ALTER TABLE outage_events RENAME CONSTRAINT incident_events_pkey TO outage_events_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_events_incident_id_fkey') THEN
    ALTER TABLE outage_events RENAME CONSTRAINT incident_events_incident_id_fkey TO outage_events_outage_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_events_monitor_id_fkey') THEN
    ALTER TABLE outage_events RENAME CONSTRAINT incident_events_monitor_id_fkey TO outage_events_monitor_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_events_user_id_fkey') THEN
    ALTER TABLE outage_events RENAME CONSTRAINT incident_events_user_id_fkey TO outage_events_user_id_fkey;
  END IF;
END $$;
