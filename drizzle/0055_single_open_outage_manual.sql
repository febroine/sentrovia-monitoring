WITH duplicate_outages AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, monitor_id
      ORDER BY started_at ASC, created_at ASC, id ASC
    ) AS position
  FROM monitor_outages
  WHERE status = 'open' AND resolved_at IS NULL
)
UPDATE monitor_outages AS outage
SET
  status = 'resolved',
  resolved_at = COALESCE(outage.last_checked_at, outage.updated_at, outage.created_at, now()),
  updated_at = now()
FROM duplicate_outages AS duplicate
WHERE outage.id = duplicate.id AND duplicate.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS monitor_outages_single_open_unique
  ON monitor_outages (user_id, monitor_id)
  WHERE status = 'open' AND resolved_at IS NULL;
