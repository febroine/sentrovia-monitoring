CREATE TABLE IF NOT EXISTS public.workspaces (
  id text PRIMARY KEY,
  name varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id text NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id),
  CONSTRAINT workspace_members_role_check CHECK (role IN ('admin', 'manager', 'operator', 'viewer'))
);

CREATE INDEX IF NOT EXISTS workspace_members_user_created_idx
  ON public.workspace_members (user_id, created_at);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_role_idx
  ON public.workspace_members (workspace_id, role);

INSERT INTO public.workspaces (id, name)
SELECT 'legacy-' || md5(current_database()), 'Sentrovia Workspace'
WHERE EXISTS (SELECT 1 FROM public.users)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role, created_at, updated_at)
SELECT
  'legacy-' || md5(current_database()),
  users.id,
  CASE
    WHEN users.role IN ('admin', 'manager', 'operator', 'viewer') THEN users.role
    WHEN users.role = 'member' THEN 'operator'
    ELSE 'viewer'
  END,
  users.created_at,
  users.updated_at
FROM public.users
ON CONFLICT (workspace_id, user_id) DO NOTHING;
