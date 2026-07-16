with ranked_presets as (
  select
    id,
    row_number() over (
      partition by user_id, name
      order by updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from log_filter_presets
)
delete from log_filter_presets
where id in (
  select id
  from ranked_presets
  where duplicate_rank > 1
);

create unique index if not exists log_filter_presets_user_name_unique
  on log_filter_presets (user_id, name);
