create table if not exists "webhook_endpoints" (
  "id" text primary key,
  "user_id" text not null references "users"("id") on delete cascade,
  "url" varchar(500) not null,
  "secret_encrypted" text,
  "is_active" boolean not null default true,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create unique index if not exists "webhook_endpoints_user_id_unique" on "webhook_endpoints" ("user_id");

create table if not exists "delivery_events" (
  "id" text primary key,
  "user_id" text not null references "users"("id") on delete cascade,
  "channel" varchar(16) not null,
  "kind" varchar(24) not null,
  "destination" varchar(500) not null,
  "payload_json" text not null,
  "status" varchar(16) not null default 'pending',
  "attempts" integer not null default 0,
  "response_code" integer,
  "error_message" text,
  "last_attempt_at" timestamptz,
  "next_retry_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz not null default now()
);

create table if not exists "slo_objectives" (
  "id" text primary key,
  "user_id" text not null references "users"("id") on delete cascade,
  "name" varchar(160) not null,
  "company_id" text references "companies"("id") on delete set null,
  "target_pct" integer not null,
  "window_days" integer not null default 30,
  "burn_rate_warning" integer not null default 2,
  "burn_rate_critical" integer not null default 5,
  "is_active" boolean not null default true,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
