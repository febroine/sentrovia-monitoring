ALTER TABLE "monitors"
ALTER COLUMN "notif_email" TYPE text;

ALTER TABLE "delivery_events"
ALTER COLUMN "destination" TYPE text;
