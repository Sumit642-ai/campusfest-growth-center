-- Fixes from the 27 Nov 2026 review. Safe to run on a fresh setup (no-ops) or on the live database.

-- Undo for pipeline edits: the app may delete its OWN history rows (never source rows, which live in src_opp_history).
drop policy if exists delete_app on app_opp_history;
create policy delete_app on app_opp_history for delete using (true);
grant delete on app_opp_history to anon, authenticated;

-- Demo bet readings belong to the 2027 season, like the bets themselves.
update bet_metrics set measured_on = '2027-01-25' where created_by = 'seed' and bet_id = 2;
update bet_metrics set measured_on = '2027-01-28' where created_by = 'seed' and bet_id = 3;

-- Seeded tasks follow the same 2027 calendar as the bets and the campaign plan.
update tasks set due_date = '2027-01-08' where created_by = 'seed' and bet_id = 1;
update tasks set due_date = '2027-01-11', title = 'Move Kabir''s cold list to warm sources (referrals, partner intros)' where created_by = 'seed' and bet_id = 2;
update tasks set due_date = '2027-01-11' where created_by = 'seed' and bet_id = 3;

-- Explain the cold-channel number, which is 1 between 25 Feb and 20 Mar.
update assumptions set value = '0 of 33 opportunities at season end',
  source = 'CampusFest 2025. Cobalt Learning (₹80k, cold LinkedIn) was confirmed on 25 Feb and withdrew on 20 Mar, so views between those dates show 1 cold deal'
where name = 'Cold channel close rate';

-- "Touches" counted every event (deliveries, replies, meetings). Effort is now measured in first contacts.
update bets set finding = '100% of confirmed deals came from warm or inbound sources; about 2 first contacts per deal' where id = 2;
update assumptions set name = 'First contacts per warm deal', value = 'about 2 (48 contacts for 24 deals)',
  source = 'CampusFest 2025 interactions: outreach sent, introductions and web inbound only (not deliveries, replies or meetings)'
where name in ('Touches per warm deal', 'First contacts per warm deal');
