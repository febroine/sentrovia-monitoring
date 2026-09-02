CREATE TABLE IF NOT EXISTS public.workspace_settings (
  workspace_id text PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  values_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workspace_settings (workspace_id, values_json)
SELECT
  workspace.id,
  COALESCE((
    SELECT to_jsonb(settings) - 'id' - 'user_id' - 'created_at' - 'updated_at'
    FROM public.workspace_members AS member
    JOIN public.user_settings AS settings ON settings.user_id = member.user_id
    WHERE member.workspace_id = workspace.id
    ORDER BY
      CASE member.role
        WHEN 'admin' THEN 0
        WHEN 'manager' THEN 1
        WHEN 'operator' THEN 2
        ELSE 3
      END,
      member.created_at,
      member.user_id
    LIMIT 1
  ), '{}'::jsonb)
FROM public.workspaces AS workspace
ON CONFLICT (workspace_id) DO NOTHING;
