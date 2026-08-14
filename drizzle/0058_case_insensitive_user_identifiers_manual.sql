DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create the case-insensitive email index because duplicate email values exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    WHERE username IS NOT NULL
    GROUP BY lower(username)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create the case-insensitive username index because duplicate username values exist.';
  END IF;
END $$;

DROP INDEX IF EXISTS users_email_unique;
CREATE UNIQUE INDEX users_email_unique ON users USING btree (lower(email));

DROP INDEX IF EXISTS users_username_unique;
CREATE UNIQUE INDEX users_username_unique ON users USING btree (lower(username));
