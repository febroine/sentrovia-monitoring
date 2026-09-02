ALTER TABLE public.monitor_outages
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.maintenance_windows (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monitor_id text REFERENCES public.monitors(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  kind varchar(16) NOT NULL DEFAULT 'maintenance',
  title varchar(160) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_windows_valid_time CHECK (ends_at > starts_at),
  CONSTRAINT maintenance_windows_valid_kind CHECK (kind IN ('maintenance', 'silence'))
);

CREATE INDEX IF NOT EXISTS maintenance_windows_workspace_time_idx
  ON public.maintenance_windows(workspace_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS maintenance_windows_monitor_time_idx
  ON public.maintenance_windows(monitor_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.incident_updates (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  outage_id text NOT NULL REFERENCES public.monitor_outages(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  visibility varchar(16) NOT NULL DEFAULT 'internal',
  update_type varchar(24) NOT NULL DEFAULT 'note',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_updates_valid_visibility CHECK (visibility IN ('internal', 'public')),
  CONSTRAINT incident_updates_valid_type CHECK (update_type IN ('note', 'status'))
);

CREATE INDEX IF NOT EXISTS incident_updates_workspace_created_idx
  ON public.incident_updates(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS incident_updates_outage_created_idx
  ON public.incident_updates(outage_id, created_at);

DROP INDEX IF EXISTS public.companies_user_normalized_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS companies_workspace_normalized_name_unique
  ON public.companies(workspace_id, lower(btrim(name)))
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.public_status_pages_user_company_unique;
DROP INDEX IF EXISTS public.public_status_pages_user_workspace_unique;
CREATE UNIQUE INDEX IF NOT EXISTS public_status_pages_workspace_company_unique
  ON public.public_status_pages(workspace_id, company_id)
  WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS public_status_pages_workspace_default_unique
  ON public.public_status_pages(workspace_id)
  WHERE company_id IS NULL;

DROP INDEX IF EXISTS public.webhook_endpoints_user_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS webhook_endpoints_workspace_id_unique
  ON public.webhook_endpoints(workspace_id);

DROP INDEX IF EXISTS public.monitor_outages_single_open_unique;
CREATE UNIQUE INDEX IF NOT EXISTS monitor_outages_single_open_unique
  ON public.monitor_outages(workspace_id, monitor_id)
  WHERE status = 'open' AND resolved_at IS NULL;
