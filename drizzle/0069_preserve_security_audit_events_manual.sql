ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_user_id_users_id_fk";

ALTER TABLE "audit_events"
  DROP CONSTRAINT IF EXISTS "audit_events_user_id_fkey";

ALTER TABLE "audit_events"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
