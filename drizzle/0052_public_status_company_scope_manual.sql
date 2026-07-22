alter table user_settings
  add column if not exists public_status_company_id text;

create index if not exists user_settings_public_status_company_id_idx
  on user_settings (public_status_company_id);
