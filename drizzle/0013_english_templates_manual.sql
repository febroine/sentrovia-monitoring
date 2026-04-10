UPDATE "user_settings"
SET
  "default_email_subject_template" = '[Sentrovia] {domain} is {event_state} ({status_code})'
WHERE "default_email_subject_template" = '{domain} ({url}) monitor alert';

UPDATE "user_settings"
SET
  "default_email_body_template" = '{domain} ({url_link}) is now {event_state}

TIME: {checked_at_local}

STATUS: {status_code} - {status_label}

ROOT CAUSE: {rca_summary}

DETAILS: {message}

{organization}'
WHERE "default_email_body_template" LIKE '%siteniz {event_state}%';

UPDATE "user_settings"
SET
  "default_telegram_template" = '{domain} ({url}) is now {event_state}

TIME: {checked_at_local}

STATUS: {status_code} - {status_label}
ROOT CAUSE: {rca_summary}'
WHERE "default_telegram_template" LIKE '%siteniz {event_state}%';
