-- History belongs to the referenced monitor, not its creator's first membership.
UPDATE public.monitor_events AS history
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE history.monitor_id = monitor.id
  AND history.workspace_id IS DISTINCT FROM monitor.workspace_id;

UPDATE public.monitor_checks AS history
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE history.monitor_id = monitor.id
  AND history.workspace_id IS DISTINCT FROM monitor.workspace_id;

UPDATE public.monitor_diagnostics AS history
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE history.monitor_id = monitor.id
  AND history.workspace_id IS DISTINCT FROM monitor.workspace_id;

UPDATE public.outage_events AS history
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE history.monitor_id = monitor.id
  AND history.workspace_id IS DISTINCT FROM monitor.workspace_id;

-- Preserve duplicate outage evidence while retaining only the latest open state.
-- Otherwise correcting scope could conflict with the per-workspace open index.
WITH ranked_open AS (
  SELECT id, row_number() OVER (
    PARTITION BY monitor_id ORDER BY started_at DESC, id DESC
  ) AS position
  FROM public.monitor_outages
  WHERE status = 'open' AND resolved_at IS NULL
)
UPDATE public.monitor_outages AS outage
SET status = 'resolved',
    resolved_at = coalesce(outage.last_checked_at, outage.started_at),
    updated_at = now()
FROM ranked_open
WHERE outage.id = ranked_open.id AND ranked_open.position > 1;

UPDATE public.monitor_outages AS history
SET workspace_id = monitor.workspace_id
FROM public.monitors AS monitor
WHERE history.monitor_id = monitor.id
  AND history.workspace_id IS DISTINCT FROM monitor.workspace_id;
