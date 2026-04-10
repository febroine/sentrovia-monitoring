alter table "user_settings"
  add column if not exists "monitoring_batch_size" integer not null default 20;

alter table "monitors"
  add column if not exists "verification_mode" boolean not null default false;

alter table "monitors"
  add column if not exists "verification_failure_count" integer not null default 0;
