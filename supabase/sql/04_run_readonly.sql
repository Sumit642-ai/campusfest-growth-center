create or replace function run_readonly(q text) returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  if q !~* '^\s*select\s' or q ~ ';'
     or q ~* '\m(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|src_opp_history|src_qualification|src_interactions|v_opp_history|v_qualification|pg_\w+|auth|storage)\M' then
    raise exception 'Only one SELECT is allowed, reading opp_snapshot(date), qual_snapshot(date), interactions_asof(date), target_in_force(date), query_metric(...), src_brands, src_contacts, src_campaigns, src_opportunities, src_activations, tasks, bets, thresholds, bet_metrics, payments, assumptions';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) x limit 200) t', q) into r;
  return r;
end $$;

revoke execute on function run_readonly(text) from public, anon, authenticated;

-- history of one opportunity up to a date (used by the analyst)
create or replace function opp_history_asof(opp text, d date) returns setof v_opp_history language sql stable as $$
  select * from v_opp_history where opportunity_id = opp and effective_at < cutoff(d) order by effective_at, history_id
$$;
