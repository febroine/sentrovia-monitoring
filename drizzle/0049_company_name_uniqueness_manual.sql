create temporary table sentrovia_company_duplicates on commit drop as
with ranked_companies as (
  select
    id,
    first_value(id) over (
      partition by user_id, lower(btrim(name))
      order by created_at asc, id asc
    ) as retained_id,
    row_number() over (
      partition by user_id, lower(btrim(name))
      order by created_at asc, id asc
    ) as duplicate_rank
  from companies
)
select id, retained_id
from ranked_companies
where duplicate_rank > 1;

update monitors as monitor
set
  company_id = duplicates.retained_id,
  company = retained.name,
  updated_at = now()
from sentrovia_company_duplicates as duplicates
join companies as retained on retained.id = duplicates.retained_id
where monitor.company_id = duplicates.id;

update report_schedules as schedule
set
  company_id = duplicates.retained_id,
  updated_at = now()
from sentrovia_company_duplicates as duplicates
where schedule.company_id = duplicates.id;

delete from companies
where id in (select id from sentrovia_company_duplicates);

create unique index if not exists companies_user_normalized_name_unique
  on companies (user_id, lower(btrim(name)));
