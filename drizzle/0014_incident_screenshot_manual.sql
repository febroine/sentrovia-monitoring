ALTER TABLE monitors
ADD COLUMN IF NOT EXISTS send_incident_screenshot boolean NOT NULL DEFAULT false;
