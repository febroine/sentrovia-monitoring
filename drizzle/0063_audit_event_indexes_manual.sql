CREATE INDEX IF NOT EXISTS "audit_events_user_created_idx"
  ON "audit_events" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "audit_events_actor_created_idx"
  ON "audit_events" ("actor_user_id", "created_at");
