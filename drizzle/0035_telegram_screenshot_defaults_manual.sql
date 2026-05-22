UPDATE monitors
SET send_incident_screenshot = true
WHERE monitor_type IN ('http', 'keyword', 'json')
  AND notification_pref IN ('telegram', 'both')
  AND send_incident_screenshot = false;
