ALTER TABLE monitors
ALTER COLUMN send_incident_screenshot SET DEFAULT true;

UPDATE monitors
SET send_incident_screenshot = true
WHERE monitor_type IN ('http', 'keyword', 'json')
  AND notification_pref IN ('email', 'both')
  AND send_incident_screenshot = false;
