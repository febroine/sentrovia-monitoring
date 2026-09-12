UPDATE public.workspace_settings AS workspace_setting
SET values_json = jsonb_set(
  COALESCE(workspace_setting.values_json, '{}'::jsonb),
  '{backupTimeZone}',
  to_jsonb(COALESCE((
    SELECT settings.time_zone
    FROM public.workspace_members AS member
    JOIN public.user_settings AS settings ON settings.user_id = member.user_id
    WHERE member.workspace_id = workspace_setting.workspace_id
      AND member.role = 'admin'
    ORDER BY member.created_at, member.user_id
    LIMIT 1
  ), 'Europe/Istanbul'::varchar)),
  true
)
WHERE NOT (COALESCE(workspace_setting.values_json, '{}'::jsonb) ? 'backupTimeZone')
  AND NOT (COALESCE(workspace_setting.values_json, '{}'::jsonb) ? 'backup_time_zone');
