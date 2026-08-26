CREATE TABLE IF NOT EXISTS public_status_pages (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id text REFERENCES companies(id) ON DELETE CASCADE,
  slug varchar(120) NOT NULL,
  title varchar(160),
  summary text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS public_status_pages_slug_unique
  ON public_status_pages (slug);

CREATE UNIQUE INDEX IF NOT EXISTS public_status_pages_user_company_unique
  ON public_status_pages (user_id, company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS public_status_pages_user_workspace_unique
  ON public_status_pages (user_id)
  WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS public_status_pages_user_created_idx
  ON public_status_pages (user_id, created_at);

INSERT INTO public_status_pages (
  id,
  user_id,
  company_id,
  slug,
  title,
  summary,
  is_enabled,
  created_at,
  updated_at
)
SELECT
  'legacy-' || md5(settings.user_id || ':' || settings.public_status_slug),
  settings.user_id,
  company.id,
  settings.public_status_slug,
  settings.public_status_title,
  settings.public_status_summary,
  settings.public_status_enabled
    AND (settings.public_status_company_id IS NULL OR company.id IS NOT NULL),
  settings.created_at,
  settings.updated_at
FROM user_settings AS settings
LEFT JOIN companies AS company
  ON company.id = settings.public_status_company_id
  AND company.user_id = settings.user_id
  AND company.deleted_at IS NULL
WHERE settings.public_status_slug IS NOT NULL
  AND length(btrim(settings.public_status_slug)) >= 3
ON CONFLICT DO NOTHING;
