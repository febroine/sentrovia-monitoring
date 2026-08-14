ALTER TABLE "delivery_events" ADD COLUMN IF NOT EXISTS "monitor_id" text;
ALTER TABLE "delivery_events" ADD COLUMN IF NOT EXISTS "dead_lettered_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'delivery_events_monitor_id_monitors_id_fk'
  ) THEN
    ALTER TABLE "delivery_events"
      ADD CONSTRAINT "delivery_events_monitor_id_monitors_id_fk"
      FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

UPDATE "delivery_events"
SET "dead_lettered_at" = COALESCE("last_attempt_at", "created_at")
WHERE "status" = 'failed' AND "dead_lettered_at" IS NULL;

CREATE INDEX IF NOT EXISTS "delivery_events_queue_due_idx"
  ON "delivery_events" USING btree ("status", "next_retry_at", "claim_expires_at", "created_at");
