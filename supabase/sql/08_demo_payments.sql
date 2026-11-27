-- Demo payments, so the north-star tile (cash collected by fest eve) shows realistic numbers.
-- The 2025 source has no bank receipts, so these rows are clearly labelled demo data ('demo seed').
-- Terms (assumption): 50% within 7 days of signing, 50% by 1 Apr or 25 days after signing, whichever is earlier.
-- A few second instalments arrive late or not at all, so collection risk is visible.
create or replace function seed_payments() returns void language sql security definer set search_path = public as $$
  delete from payments where note like 'demo seed%';
  with signed as (
    select o.opportunity_id, min((h.effective_at at time zone 'Asia/Kolkata')::date) as signed_on,
           max(h.confirmed_value_inr) as value, abs(hashtext(o.opportunity_id)) % 10 as r
    from src_opportunities o join src_opp_history h using (opportunity_id)
    where o.support_type = 'cash' and h.stage = 'partner_confirmed'
      and o.opportunity_id in (select opportunity_id from opp_snapshot(date '2025-04-20') where stage = 'partner_confirmed')
    group by o.opportunity_id
  )
  insert into payments (opportunity_id, amount_inr, due_date, paid_on, method, note)
  select opportunity_id, round(value * 0.5), signed_on + 7, signed_on + 3 + (r % 4), 'bank transfer', 'demo seed: advance 50%' from signed
  union all
  select opportunity_id, value - round(value * 0.5), least(signed_on + 25, date '2025-04-01'),
         case when r in (0, 1) then null                                                      -- 2 in 10 not paid yet
              when r = 2 then least(signed_on + 25, date '2025-04-01') + 12                    -- 1 in 10 pays after the fest
              else least(signed_on + 25, date '2025-04-01') - (r % 3) end,
         'bank transfer', 'demo seed: balance 50%' from signed;
$$;
grant execute on function seed_payments() to service_role;
revoke execute on function seed_payments() from public, anon, authenticated;
select seed_payments();

-- Reset also restores the demo payments and the seeded plan.
create or replace function reset_demo() returns void language sql security definer set search_path = public as $$
  delete from app_opp_history where true;
  delete from app_qualification where true;
  delete from payments where true;
  delete from tasks where created_by <> 'seed';
  delete from bet_metrics where created_by <> 'seed';
  select seed_campaign_plan();
  select seed_payments();
  insert into activity_log (actor, action, detail) values ('app', 'reset_demo', '{}'::jsonb);
$$;
