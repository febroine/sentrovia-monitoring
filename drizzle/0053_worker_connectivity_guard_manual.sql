alter table worker_state
  add column if not exists connectivity_status varchar(16) not null default 'unknown',
  add column if not exists connectivity_checked_at timestamptz,
  add column if not exists connectivity_message text;
