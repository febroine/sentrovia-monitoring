UPDATE user_settings
SET default_email_body_template = '🌐 {domain} ({url_link}) is now {event_state}
🕒 Time: {checked_at_local}
📌 Status: {status_code} - {status_label}
🔍 Root cause: {rca_summary}
📝 Details: {message}
🏢 {organization}',
    updated_at = NOW()
WHERE default_email_body_template IS NOT NULL;
