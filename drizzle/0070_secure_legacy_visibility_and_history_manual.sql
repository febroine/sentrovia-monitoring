UPDATE "monitors" AS monitor
SET "publish_on_status_page" = false,
    "updated_at" = now()
WHERE monitor."publish_on_status_page" = true
  AND NOT EXISTS (
    SELECT 1
    FROM "user_settings" AS settings
    WHERE settings."user_id" = monitor."user_id"
      AND settings."public_status_enabled" = true
      AND (
        settings."public_status_company_id" IS NULL
        OR settings."public_status_company_id" = monitor."company_id"
      )
  );

UPDATE "delivery_events"
SET "destination" = '[redacted legacy webhook]'
WHERE "channel" IN ('webhook', 'discord')
  AND "destination" <> '[redacted legacy webhook]'
  AND "destination" NOT LIKE '%/[redacted]';
