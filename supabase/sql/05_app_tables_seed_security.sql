-- App-only tables: the plan (bets, thresholds, assumptions), our own records (tasks, payments, readings)
-- and an audit log. Source tables (src_*) are never edited.

create table bets (id serial primary key, name text, finding text, budget_inr numeric, spent_inr numeric default 0, owner text,
  start_date date, end_date date, extra_if_works_inr numeric, chance numeric, ev_inr numeric);
create table thresholds (id serial primary key, bet_id int references bets, metric text, min_sample int, scale_if numeric, stop_if numeric,
  direction text default 'higher_is_better', guardrail text, first_read text, rule_text text);
create table bet_metrics (id serial primary key, bet_id int references bets, measured_on date, sample int, value numeric,
  note text, created_by text default 'app');
create table tasks (id serial primary key, title text, owner text, due_date date, status text default 'open', opportunity_id text,
  bet_id int, reason text, created_by text default 'human', created_at timestamptz default now());
create table payments (id serial primary key, opportunity_id text, amount_inr numeric, due_date date, paid_on date, method text, note text,
  created_at timestamptz default now());
create table assumptions (id serial primary key, name text, value text, source text, is_assumption boolean, confidence text);
create table activity_log (id serial primary key, at timestamptz default now(), actor text, action text, detail jsonb);

-- The 5 bets (blueprint, slide 2)
insert into bets (name, finding, budget_inr, owner, start_date, end_date, extra_if_works_inr, chance, ev_inr) values
 ('Proof Pack renewals and upsell', 'Only 3 of 24 partners got an activation', 30000, 'Meera Iyer', '2027-01-04', '2027-01-24', 570000, 0.70, 400000),
 ('Scale the warm engine', '100% of confirmed deals came from warm or inbound sources; about 7 touches per deal', 60000, 'Kabir Shah', '2027-01-04', '2027-02-28', 770000, 0.60, 460000),
 ('Zombie rescue with AI-drafted proposals', '26 frozen cold deals worth ₹14.4L', 20000, 'Riya Kapoor', '2027-01-04', '2027-01-31', 360000, 0.40, 150000),
 ('Sponsor-funded attendee campaigns (flywheel)', 'Sponsors and attendee campaigns were linked only 3 times', 30000, 'Meera Iyer', '2027-01-11', '2027-02-28', 600000, 0.35, 210000),
 ('Category exclusivity auction', '6 food, 5 mobility and 5 consumer brands shared one audience in 2025', 45000, 'Riya Kapoor', '2027-01-20', '2027-03-25', 350000, 0.45, 160000);

-- Scale / change / stop lines (blueprint, slide 3). value >= scale_if -> SCALE, value <= stop_if -> STOP, else CHANGE.
insert into thresholds (bet_id, metric, min_sample, scale_if, stop_if, guardrail, first_read, rule_text) values
 (1, 'Proof Pack partners who book a meeting within 7 days (of 18)', 18, 9, 4, 'No partner lost because of the bigger ask; the 6-partner holdout is read as direction only', 'By 5 Feb',
  'Scale if 9+ of 18 meet (pack to all 24); change if 5-8 (keep pack, drop the upsell); stop if 4 or fewer (money to Bet 2)'),
 (2, 'New warm brands per week', 3, 6.5, 4.6, 'At least 40% of referred brands qualify', 'Weeks 1-3',
  'Scale if >= 6.5 a week; change if 4.6-6.5; stop if no better than 2025''s 4.6'),
 (3, 'Revived deals that move a stage within 14 days (of first 10)', 10, 3, 0, 'No closer time taken from warm deals', 'First 10 revived deals',
  'Scale if >= 3 of 10 move; change if 1-2; stop if 0'),
 (4, 'Co-funded slots sold (of first 8 pitches)', 8, 3, 0, 'Attendee team confirms we can deliver promised sign-ups', 'First 8 pitches, by 20 Feb',
  'Scale if >= 3 of 8 sold; change if 1-2; stop if 0'),
 (5, 'Categories with 2+ sealed bids above the tier price (of 3)', 3, 2, 0, 'No losing bidder drops out of a lower tier', 'Bids close 14 Feb',
  'Scale if 2+ categories get 2+ bids (run all 3); change if 1 (sell at a fixed premium); stop if 0 (sell normal tiers)');

-- Demo readings so the status chips can be seen working. Clearly labelled: next season has not happened yet.
insert into bet_metrics (bet_id, measured_on, sample, value, note, created_by) values
 (2, '2025-04-14', 2, 5.5, 'Demo reading, not real data', 'seed'),
 (3, '2025-04-16', 10, 3, 'Demo reading, not real data', 'seed');

insert into assumptions (name, value, source, is_assumption, confidence) values
 ('Average confirmed deal', '₹93,333 (median ₹92,500)', 'CampusFest 2025, 24 confirmed deals', false, 'high'),
 ('Warm brand-to-deal rate', '55%', 'CampusFest 2025 warm and inbound campaigns', false, 'medium'),
 ('Touches per warm deal', 'about 7', 'CampusFest 2025 interactions', false, 'medium'),
 ('Cold channel close rate', '0 of 33 opportunities', 'CampusFest 2025', false, 'high'),
 ('Median days to close', '10', 'CampusFest 2025 opportunity history', false, 'medium'),
 ('In-kind share of confirmed value', '11%', 'CampusFest 2025', false, 'high'),
 ('Renewal rate of past partners', '50% (65% with Proof Pack)', 'Plan assumption, no renewal data in source', true, 'low'),
 ('New warm brands next season', '30 (45 with Bet 2)', 'Plan assumption from 2025 pace of 4.6 a week', true, 'medium'),
 ('Frozen deals that can be revived', '20%', 'Plan assumption', true, 'low'),
 ('Confirmed cash paid before the fest', '87%', 'Plan assumption, source has no bank receipts', true, 'low'),
 ('Work budget', '₹1.85L across 5 bets', 'Plan', true, 'medium');

insert into tasks (title, owner, due_date, status, bet_id, reason, created_by) values
 ('Send Proof Pack to 18 past partners, normal email to 6 holdout', 'Meera Iyer', '2025-04-25', 'open', 1, 'Bet 1 needs a clean holdout to prove cause', 'seed'),
 ('Move Kabir''s cold list to warm sources (referrals, alumni, partner form)', 'Kabir Shah', '2025-04-28', 'open', 2, 'Kabir owns 126 of 180 brands and zero opportunities', 'seed'),
 ('Rank the 26 frozen cold deals and draft proposals for the top 10', 'Riya Kapoor', '2025-04-30', 'open', 3, '26 open deals worth ₹14.4L have not moved since March', 'seed');

-- Reset button: removes everything users and testers added, keeps source data and the seeded plan.
create or replace function reset_demo() returns void language sql security definer set search_path = public as $$
  delete from app_opp_history where true;
  delete from app_qualification where true;
  delete from payments where true;
  delete from tasks where created_by <> 'seed';
  delete from bet_metrics where created_by <> 'seed';
  insert into activity_log (actor, action, detail) values ('app', 'reset_demo', '{}'::jsonb);
$$;

-- Security: everything readable, source tables read-only, app tables writable.
do $$
declare t text;
begin
  foreach t in array array['src_event','src_targets','src_brands','src_contacts','src_campaigns','src_interactions','src_qualification',
    'src_opportunities','src_opp_history','src_activations','app_opp_history','app_qualification','bets','thresholds','bet_metrics',
    'tasks','payments','assumptions','activity_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select using (true)', t);
  end loop;
  foreach t in array array['app_opp_history','app_qualification','tasks','payments','bet_metrics','activity_log'] loop
    execute format('create policy insert_app on %I for insert with check (true)', t);
  end loop;
  foreach t in array array['tasks','payments'] loop
    execute format('create policy update_app on %I for update using (true) with check (true)', t);
    execute format('create policy delete_app on %I for delete using (true)', t);
  end loop;
end $$;

-- Explicit grants, so the Data API works even if "Grant API access to new tables automatically" was off.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant insert on app_opp_history, app_qualification, tasks, payments, bet_metrics, activity_log to anon, authenticated;
grant update, delete on tasks, payments to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
revoke execute on function run_readonly(text) from public, anon, authenticated;
grant execute on function run_readonly(text) to service_role;
