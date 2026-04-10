create table if not exists "log_filter_presets" (
  "id" text primary key,
  "user_id" text not null references "users"("id") on delete cascade,
  "name" varchar(120) not null,
  "filters_json" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create table if not exists "audit_events" (
  "id" text primary key,
  "user_id" text not null references "users"("id") on delete cascade,
  "actor_user_id" text references "users"("id") on delete set null,
  "actor_label" varchar(255) not null,
  "entity_type" varchar(32) not null,
  "entity_id" text,
  "entity_label" varchar(255) not null,
  "action" varchar(64) not null,
  "summary" text not null,
  "created_at" timestamptz not null default now()
);
