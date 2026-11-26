-- One call for the Mission Control chart: confirmed partnerships and the target in force at each week end (Sundays) up to the date.
create or replace function weekly_confirmed(as_of date) returns table (week_end date, confirmed bigint, goal int)
language sql stable as $$
  with ends as (
    select d::date as week_end from generate_series('2025-01-19'::date, as_of - 1, interval '7 days') d
    union select as_of
  )
  select e.week_end,
         (select count(*) from opp_snapshot(e.week_end) s where s.stage = 'partner_confirmed'),
         (select t.confirmed_partnerships_goal from target_in_force(e.week_end) t)
  from ends e order by 1
$$;
grant execute on function weekly_confirmed(date) to anon, authenticated, service_role;
