UPDATE monitors
SET email_subject = NULL,
    email_body = NULL,
    updated_at = NOW()
WHERE (email_subject = 'Monitor alert: {name}'
  AND email_body LIKE 'Hello,%{time}%')
   OR (email_subject = '{domain} ({url}) monitor alert'
  AND email_body LIKE '%siteniz {event_state} oldu%');
