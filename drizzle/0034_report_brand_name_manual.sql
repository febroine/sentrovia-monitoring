ALTER TABLE "report_schedules"
ADD COLUMN IF NOT EXISTS "report_brand_name" varchar(120);
