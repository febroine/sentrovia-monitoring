ALTER TABLE "worker_cycle_metrics" ADD COLUMN IF NOT EXISTS "average_schedule_lag_ms" integer;
ALTER TABLE "worker_cycle_metrics" ADD COLUMN IF NOT EXISTS "max_schedule_lag_ms" integer;
