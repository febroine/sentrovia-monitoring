UPDATE "users"
SET "role" = 'operator',
    "session_version" = "session_version" + 1,
    "updated_at" = now()
WHERE "role" = 'member';

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'operator';

ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_role_check";

ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('admin', 'manager', 'operator', 'viewer'));
