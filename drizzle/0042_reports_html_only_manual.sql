UPDATE "report_schedules"
SET "attach_csv" = false,
    "attach_html" = true,
    "attach_pdf" = false;

ALTER TABLE "report_schedules"
ALTER COLUMN "attach_csv" SET DEFAULT false;

ALTER TABLE "report_schedules"
ALTER COLUMN "attach_html" SET DEFAULT true;

ALTER TABLE "report_schedules"
ALTER COLUMN "attach_pdf" SET DEFAULT false;
