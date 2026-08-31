ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.automatic_backup_runs ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.public_status_pages ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.monitors ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.monitor_events ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.monitor_checks ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.monitor_outages ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.webhook_endpoints ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.delivery_events ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.monitor_diagnostics ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE public.outage_events ADD COLUMN IF NOT EXISTS workspace_id text;

UPDATE public.companies AS target
SET workspace_id = (
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = target.user_id
  ORDER BY created_at, workspace_id
  LIMIT 1
)
WHERE target.workspace_id IS NULL;

UPDATE public.public_status_pages AS target
SET workspace_id = COALESCE(
  (SELECT workspace_id FROM public.companies WHERE id = target.company_id),
  (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = target.user_id
    ORDER BY created_at, workspace_id
    LIMIT 1
  )
)
WHERE target.workspace_id IS NULL;

UPDATE public.monitors AS target
SET workspace_id = COALESCE(
  (SELECT workspace_id FROM public.companies WHERE id = target.company_id),
  (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = target.user_id
    ORDER BY created_at, workspace_id
    LIMIT 1
  )
)
WHERE target.workspace_id IS NULL;

UPDATE public.monitor_events AS target
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE target.workspace_id IS NULL AND monitor.id = target.monitor_id;

UPDATE public.monitor_checks AS target
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE target.workspace_id IS NULL AND monitor.id = target.monitor_id;

UPDATE public.monitor_outages AS target
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE target.workspace_id IS NULL AND monitor.id = target.monitor_id;

UPDATE public.monitor_diagnostics AS target
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE target.workspace_id IS NULL AND monitor.id = target.monitor_id;

UPDATE public.outage_events AS target
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE target.workspace_id IS NULL AND monitor.id = target.monitor_id;

UPDATE public.webhook_endpoints AS target
SET workspace_id = (
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = target.user_id
  ORDER BY created_at, workspace_id
  LIMIT 1
)
WHERE target.workspace_id IS NULL;

UPDATE public.delivery_events AS target
SET workspace_id = COALESCE(
  (SELECT workspace_id FROM public.monitors WHERE id = target.monitor_id),
  (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = target.user_id
    ORDER BY created_at, workspace_id
    LIMIT 1
  )
)
WHERE target.workspace_id IS NULL;

UPDATE public.report_schedules AS target
SET workspace_id = COALESCE(
  (SELECT workspace_id FROM public.companies WHERE id = target.company_id),
  (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = target.user_id
    ORDER BY created_at, workspace_id
    LIMIT 1
  )
)
WHERE target.workspace_id IS NULL;

UPDATE public.audit_events AS target
SET workspace_id = COALESCE(
  (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = target.actor_user_id ORDER BY created_at, workspace_id LIMIT 1
  ),
  (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = target.user_id ORDER BY created_at, workspace_id LIMIT 1
  ),
  (SELECT id FROM public.workspaces ORDER BY created_at, id LIMIT 1)
)
WHERE target.workspace_id IS NULL;

UPDATE public.automatic_backup_runs AS target
SET workspace_id = COALESCE(
  (
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = target.owner_user_id ORDER BY created_at, workspace_id LIMIT 1
  ),
  (SELECT id FROM public.workspaces ORDER BY created_at, id LIMIT 1)
)
WHERE target.workspace_id IS NULL;

DO $$
DECLARE
  table_name text;
  unresolved_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'audit_events', 'automatic_backup_runs', 'companies', 'public_status_pages',
    'monitors', 'monitor_events', 'monitor_checks', 'monitor_outages',
    'webhook_endpoints', 'delivery_events', 'report_schedules',
    'monitor_diagnostics', 'outage_events'
  ]
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE workspace_id IS NULL', table_name)
      INTO unresolved_count;
    IF unresolved_count > 0 THEN
      RAISE EXCEPTION 'Unable to resolve workspace ownership for % row(s) in %.', unresolved_count, table_name;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN workspace_id SET NOT NULL', table_name);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = table_name || '_workspace_id_fkey'
        AND conrelid = format('public.%I', table_name)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE',
        table_name,
        table_name || '_workspace_id_fkey'
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS audit_events_workspace_created_idx
  ON public.audit_events (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS automatic_backup_runs_workspace_updated_idx
  ON public.automatic_backup_runs (workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS companies_workspace_deleted_at_idx
  ON public.companies (workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS public_status_pages_workspace_created_idx
  ON public.public_status_pages (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS monitors_workspace_deleted_at_idx
  ON public.monitors (workspace_id, deleted_at);
CREATE INDEX IF NOT EXISTS monitor_events_workspace_created_idx
  ON public.monitor_events (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS monitor_checks_workspace_created_idx
  ON public.monitor_checks (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS monitor_outages_workspace_created_idx
  ON public.monitor_outages (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS webhook_endpoints_workspace_created_idx
  ON public.webhook_endpoints (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS delivery_events_workspace_created_idx
  ON public.delivery_events (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS report_schedules_workspace_created_idx
  ON public.report_schedules (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS monitor_diagnostics_workspace_created_idx
  ON public.monitor_diagnostics (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS outage_events_workspace_created_idx
  ON public.outage_events (workspace_id, created_at);
