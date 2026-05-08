UPDATE "monitors"
SET "email_subject" = NULL
WHERE "email_subject" = '[Sentrovia] {domain} is {event_state} ({status_code})';

UPDATE "monitors"
SET "email_body" = NULL
WHERE "email_body" = E'Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}';

UPDATE "monitors"
SET "telegram_template" = NULL
WHERE "telegram_template" = E'{domain} ({url}) is now {event_state}\n\nTIME: {checked_at_local}\n\nSTATUS: {status_code} - {status_label}\nROOT CAUSE: {rca_summary}';

UPDATE "monitors" AS monitor
SET "email_subject" = NULL
FROM "user_settings" AS settings
WHERE monitor."user_id" = settings."user_id"
  AND monitor."email_subject" = settings."default_email_subject_template";

UPDATE "monitors" AS monitor
SET "email_body" = NULL
FROM "user_settings" AS settings
WHERE monitor."user_id" = settings."user_id"
  AND monitor."email_body" = settings."default_email_body_template";

UPDATE "monitors" AS monitor
SET "telegram_template" = NULL
FROM "user_settings" AS settings
WHERE monitor."user_id" = settings."user_id"
  AND monitor."telegram_template" = settings."default_telegram_template";
