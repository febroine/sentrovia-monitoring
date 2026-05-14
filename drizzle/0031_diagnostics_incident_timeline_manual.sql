CREATE TABLE IF NOT EXISTS "monitor_diagnostics" (
  "id" text PRIMARY KEY NOT NULL,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" varchar(16) NOT NULL,
  "failed_phase" varchar(24),
  "failure_category" varchar(40),
  "summary" text NOT NULL,
  "dns_status" varchar(16),
  "resolved_ips" text[] DEFAULT ARRAY[]::text[] NOT NULL,
  "tcp_status" varchar(16),
  "tls_status" varchar(16),
  "http_status" varchar(16),
  "http_status_code" integer,
  "response_time_ms" integer,
  "timeout_ms" integer NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "incident_events" (
  "id" text PRIMARY KEY NOT NULL,
  "incident_id" text REFERENCES "monitor_incidents"("id") ON DELETE set null,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_type" varchar(48) NOT NULL,
  "title" varchar(160) NOT NULL,
  "detail" text,
  "metadata_json" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "monitor_diagnostics_user_monitor_created_idx"
ON "monitor_diagnostics" ("user_id", "monitor_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "monitor_diagnostics_monitor_created_idx"
ON "monitor_diagnostics" ("monitor_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "incident_events_user_monitor_created_idx"
ON "incident_events" ("user_id", "monitor_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "incident_events_incident_created_idx"
ON "incident_events" ("incident_id", "created_at" DESC);
