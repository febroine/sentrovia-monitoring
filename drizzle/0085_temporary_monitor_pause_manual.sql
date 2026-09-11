ALTER TABLE public.monitors
  ADD COLUMN IF NOT EXISTS paused_until timestamptz;

CREATE INDEX IF NOT EXISTS monitors_workspace_pause_idx
  ON public.monitors(workspace_id, paused_until)
  WHERE is_active = true AND deleted_at IS NULL AND paused_until IS NOT NULL;
