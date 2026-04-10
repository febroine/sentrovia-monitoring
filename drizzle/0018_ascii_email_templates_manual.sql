UPDATE user_settings
SET default_email_body_template = E'Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}',
    updated_at = NOW()
WHERE default_email_body_template LIKE '????%'
   OR default_email_body_template LIKE '🌐 %';

UPDATE monitors
SET email_body = E'Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}',
    updated_at = NOW()
WHERE email_body LIKE '????%'
   OR email_body LIKE '🌐 %';
