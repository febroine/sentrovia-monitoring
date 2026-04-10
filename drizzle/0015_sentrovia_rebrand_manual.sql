UPDATE "user_settings"
SET "default_email_subject_template" = REPLACE("default_email_subject_template", '[Sentinel]', '[Sentrovia]')
WHERE "default_email_subject_template" LIKE '%[Sentinel]%';
