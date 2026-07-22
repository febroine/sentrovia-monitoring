alter table monitors
  add column if not exists heartbeat_token text,
  add column if not exists heartbeat_last_received_at timestamptz;

with ranked_heartbeat_tokens as (
  select
    id,
    row_number() over (
      partition by heartbeat_token
      order by created_at, id
    ) as token_rank
  from monitors
  where heartbeat_token is not null
), replacement_tokens as (
  select
    id,
    md5(id || random()::text || clock_timestamp()::text) as heartbeat_token
  from ranked_heartbeat_tokens
  where token_rank > 1
)
update monitors as monitor
set
  heartbeat_token = replacement.heartbeat_token,
  url = 'heartbeat://' || replacement.heartbeat_token,
  updated_at = now()
from replacement_tokens as replacement
where monitor.id = replacement.id;

create unique index if not exists monitors_heartbeat_token_unique
  on monitors (heartbeat_token);
