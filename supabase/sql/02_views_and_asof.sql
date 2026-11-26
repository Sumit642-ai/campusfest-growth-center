create view v_interactions as select distinct on (interaction_id) * from src_interactions order by interaction_id;
create table app_opp_history (like src_opp_history, created_by text default 'app', created_at_app timestamptz default now());
create table app_qualification (like src_qualification, created_by text default 'app', created_at_app timestamptz default now());
create view v_opp_history as
  select distinct on (history_id) opportunity_name, brand_name, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at, history_id, opportunity_id, brand_id, owner_id, 'source' as origin from src_opp_history
  union all
  select opportunity_name, brand_name, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at, history_id, opportunity_id, brand_id, owner_id, 'app' from app_opp_history;
create view v_qualification as
  select distinct on (history_id) brand_name, qualification_status, reason, source_campaign_name, effective_at, history_id, brand_id, sponsor_campaign_id, 'source' as origin from src_qualification
  union all
  select brand_name, qualification_status, reason, source_campaign_name, effective_at, history_id, brand_id, sponsor_campaign_id, 'app' from app_qualification;
create function cutoff(d date) returns timestamptz language sql immutable as $$
  select ((d + 1)::timestamp at time zone 'Asia/Kolkata')
$$;
create function opp_snapshot(d date) returns table (
  opportunity_id text, opportunity_name text, brand_id text, brand_name text, stage text,
  proposed_value_inr numeric, confirmed_value_inr numeric, owner_name text, effective_at timestamptz,
  support_type text, originating_campaign_name text, industry text, days_in_stage int)
language sql stable as $$
  select h.opportunity_id, h.opportunity_name, h.brand_id, h.brand_name, h.stage,
         h.proposed_value_inr, h.confirmed_value_inr, h.owner_name, h.effective_at,
         o.support_type, o.originating_campaign_name, b.industry,
         (d - (h.effective_at at time zone 'Asia/Kolkata')::date)
  from (select distinct on (opportunity_id) * from v_opp_history
        where effective_at < cutoff(d)
        order by opportunity_id, effective_at desc, history_id desc) h
  join src_opportunities o using (opportunity_id)
  join src_brands b on b.brand_id = h.brand_id
$$;
create function qual_snapshot(d date) returns setof v_qualification language sql stable as $$
  select distinct on (brand_id) * from v_qualification
  where effective_at < cutoff(d)
  order by brand_id, effective_at desc, history_id desc
$$;
create function interactions_asof(d date) returns setof v_interactions language sql stable as $$
  select * from v_interactions where occurred_at < cutoff(d)
$$;
create function target_in_force(d date) returns setof src_targets language sql stable as $$
  select * from src_targets where effective_at < cutoff(d) order by effective_at desc limit 1
$$;
