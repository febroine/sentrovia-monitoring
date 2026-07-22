insert into user_settings (id, user_id)
select md5('sentrovia-user-settings:' || users.id), users.id
from users
where not exists (
  select 1
  from user_settings
  where user_settings.user_id = users.id
)
on conflict do nothing;
