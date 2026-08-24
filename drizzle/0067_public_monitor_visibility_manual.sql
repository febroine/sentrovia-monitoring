ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "publish_on_status_page" boolean;

UPDATE "monitors"
SET "publish_on_status_page" = true
WHERE "publish_on_status_page" IS NULL;

ALTER TABLE "monitors"
  ALTER COLUMN "publish_on_status_page" SET DEFAULT false,
  ALTER COLUMN "publish_on_status_page" SET NOT NULL;
