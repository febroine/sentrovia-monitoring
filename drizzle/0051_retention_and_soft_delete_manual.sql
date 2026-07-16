alter table user_settings
  add column if not exists delivery_retention_days integer not null default 90;

alter table worker_state
  add column if not exists last_retention_cleanup_at timestamptz;

alter table monitors
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_was_active boolean;

alter table companies
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_was_active boolean;

create index if not exists monitors_user_deleted_at_idx
  on monitors (user_id, deleted_at);

create index if not exists companies_user_deleted_at_idx
  on companies (user_id, deleted_at);
