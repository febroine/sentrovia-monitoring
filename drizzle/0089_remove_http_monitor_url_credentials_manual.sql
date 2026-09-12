UPDATE "monitors"
SET
  "url" = regexp_replace("url", '^(https?://)[^/?#]*@', '\1', 'i'),
  "updated_at" = now()
WHERE
  "monitor_type" IN ('http', 'keyword', 'json')
  AND "url" ~* '^https?://[^/?#]*@';
