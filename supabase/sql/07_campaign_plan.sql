-- Campaign management for next season: the team's own campaign plan (owner, dates, budget, status, target)
-- and a spend log. 2025 source campaigns stay read-only; this is the 2027 plan built from the 2025 findings.

create table if not exists campaign_plan (
  id serial primary key,
  name text not null,
  channel text,
  kind text,                       -- warm, inbound, renewal, revival, partner, cold
  owner text,
  start_date date,
  end_date date,
  budget_inr numeric default 0,
  status text default 'planned',   -- planned, active, paused, stopped, done
  target_deals numeric default 0,
  target_value_inr numeric default 0,
  bet_id int references bets,
  based_on text,                   -- the 2025 campaign or finding it builds on
  note text,
  created_by text default 'human',
  updated_at timestamptz default now()
);

create table if not exists campaign_spend (
  id serial primary key,
  campaign_id int references campaign_plan on delete cascade,
  amount_inr numeric not null,
  spent_on date,
  note text,
  created_by text default 'human',
  created_at timestamptz default now()
);

-- Seed plan. Budgets add up to the ₹1.85L work budget on slide 2. Deal targets add up to 38 (the P50 on slide 1) at the
-- 2025 average deal of about ₹93k; add-ons raise value on existing deals, so they add value but no new deals.
create or replace function seed_campaign_plan() returns void language sql security definer set search_path = public as $$
  delete from campaign_spend where true;
  delete from campaign_plan where true;
  insert into campaign_plan (name, channel, kind, owner, start_date, end_date, budget_inr, status, target_deals, target_value_inr, bet_id, based_on, note, created_by) values
   ('Creator & alumni referrals', 'introduction', 'warm', 'Nisha Rao', '2027-01-04', '2027-02-28', 35000, 'planned', 8, 744000, 2,
    'Creator Network Referrals: 72 touches, 9 deals in 2025', 'Referral fee paid only on a signed deal', 'seed'),
   ('Warm partner introductions', 'introduction', 'warm', 'Riya Kapoor', '2027-01-04', '2027-02-28', 25000, 'planned', 7, 651000, 2,
    'Warm Partner Introductions: 34 touches, 8 deals in 2025', 'Best rate in 2025: 4.3 touches per deal', 'seed'),
   ('Partner interest form', 'web_inbound', 'inbound', 'Kabir Shah', '2027-01-04', '2027-03-20', 0, 'planned', 5, 465000, null,
    'Partner Interest Form: 62 touches, 7 deals in 2025', 'Kabir moves here from cold email', 'seed'),
   ('Proof Pack renewals', 'email', 'renewal', 'Meera Iyer', '2027-01-04', '2027-01-24', 30000, 'planned', 14, 1302000, 1,
    'Only 3 of 24 partners got an activation in 2025', '18 partners get the pack, 6 held out', 'seed'),
   ('Zombie rescue, AI-drafted proposals', 'email', 'revival', 'Riya Kapoor', '2027-01-04', '2027-01-31', 20000, 'planned', 2, 186000, 3,
    '26 frozen cold deals worth ₹14.4L', 'A person reviews every AI draft before it is sent', 'seed'),
   ('Sponsor-funded attendee campaigns', 'partnership', 'partner', 'Meera Iyer', '2027-01-11', '2027-02-28', 30000, 'planned', 2, 300000, 4,
    'Only 3 sponsor–attendee links in 2025', 'Co-funded slots at ₹1.5L each', 'seed'),
   ('Outcome add-ons', 'upsell', 'renewal', 'Riya Kapoor', '2027-01-18', '2027-03-14', 45000, 'planned', 0, 180000, 5,
    'Partners saw little measurable value', 'e.g. 500 verified sign-ups for ₹50k', 'seed'),
   ('Brand discovery email', 'email', 'cold', 'Kabir Shah', null, null, 0, 'stopped', 0, 0, null,
    'Brand Discovery Email: 507 touches, 0 deals in 2025', 'Stopped: cold outreach closed 0 of 33 in 2025', 'seed');
$$;
select seed_campaign_plan();

-- Budget vs spend per campaign (what the app and the analyst read).
create or replace view v_campaign_budget as
select p.id, p.name, p.kind, p.owner, p.status, p.start_date, p.end_date, p.bet_id,
       p.budget_inr, coalesce(s.spent, 0) as spent_inr, p.budget_inr - coalesce(s.spent, 0) as remaining_inr,
       case when p.budget_inr > 0 then round(coalesce(s.spent, 0) / p.budget_inr * 100, 1) end as pct_spent,
       p.target_deals, p.target_value_inr,
       case when p.budget_inr > 0 and p.target_deals > 0 then round(p.budget_inr / p.target_deals) end as planned_cost_per_deal
from campaign_plan p
left join (select campaign_id, sum(amount_inr) as spent from campaign_spend group by campaign_id) s on s.campaign_id = p.id;

-- Reset button also restores the seeded plan.
create or replace function reset_demo() returns void language sql security definer set search_path = public as $$
  delete from app_opp_history where true;
  delete from app_qualification where true;
  delete from payments where true;
  delete from tasks where created_by <> 'seed';
  delete from bet_metrics where created_by <> 'seed';
  select seed_campaign_plan();
  insert into activity_log (actor, action, detail) values ('app', 'reset_demo', '{}'::jsonb);
$$;

-- Read-only SQL fallback may also read the plan.
create or replace function run_readonly(q text) returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  if q !~* '^\s*select\s' or q ~ ';'
     or q ~* '\m(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|src_opp_history|src_qualification|src_interactions|v_opp_history|v_qualification|pg_\w+|auth|storage)\M' then
    raise exception 'Only one SELECT is allowed, reading opp_snapshot(date), qual_snapshot(date), interactions_asof(date), target_in_force(date), query_metric(...), src_brands, src_contacts, src_campaigns, src_opportunities, src_activations, tasks, bets, thresholds, bet_metrics, payments, assumptions, campaign_plan, campaign_spend, v_campaign_budget, v_campaign_budget_totals';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) x limit 200) t', q) into r;
  return r;
end $$;
revoke execute on function run_readonly(text) from public, anon, authenticated;
grant execute on function run_readonly(text) to service_role;

-- Security: readable by all, writable from the app (same model as tasks and payments).
alter table campaign_plan enable row level security;
alter table campaign_spend enable row level security;
drop policy if exists read_all on campaign_plan;   create policy read_all on campaign_plan for select using (true);
drop policy if exists read_all on campaign_spend;  create policy read_all on campaign_spend for select using (true);
drop policy if exists write_app on campaign_plan;  create policy write_app on campaign_plan for all using (true) with check (true);
drop policy if exists write_app on campaign_spend; create policy write_app on campaign_spend for all using (true) with check (true);
grant select, insert, update, delete on campaign_plan, campaign_spend to anon, authenticated;
grant select on v_campaign_budget to anon, authenticated;
grant all on campaign_plan, campaign_spend, v_campaign_budget to service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on function seed_campaign_plan() to service_role;
revoke execute on function seed_campaign_plan() from public, anon, authenticated;

-- Totals across live (not stopped) campaigns, so nobody has to add up rows by hand.
create or replace view v_campaign_budget_totals as
select count(*) filter (where status <> 'stopped') as live_campaigns,
       sum(budget_inr) filter (where status <> 'stopped') as budget_inr,
       sum(spent_inr) as spent_inr,
       sum(budget_inr) filter (where status <> 'stopped') - sum(spent_inr) as remaining_inr,
       count(*) filter (where spent_inr > budget_inr) as campaigns_over_budget,
       sum(target_deals) filter (where status <> 'stopped') as target_deals,
       sum(target_value_inr) filter (where status <> 'stopped') as target_value_inr
from v_campaign_budget;
grant select on v_campaign_budget_totals to anon, authenticated, service_role;
