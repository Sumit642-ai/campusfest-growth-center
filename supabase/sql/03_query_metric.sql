create or replace function query_metric(metric text, as_of date, filters jsonb default '{}', group_by text default null)
returns table (grp text, value numeric, n bigint) language plpgsql stable as $$
declare
  src text; expr text; cond text := 'true'; allowed text[]; k text; v text;
begin
  if metric in ('confirmed_partnerships','confirmed_value','avg_confirmed_deal','opportunities','open_opportunities','open_pipeline_value','stuck_opportunities') then
    src := format('opp_snapshot(%L)', as_of);
    allowed := array['stage','owner_name','industry','support_type','originating_campaign_name','brand_name'];
    expr := case metric
      when 'confirmed_partnerships' then 'count(*) filter (where stage=''partner_confirmed'')'
      when 'confirmed_value' then 'coalesce(sum(confirmed_value_inr) filter (where stage=''partner_confirmed''),0)'
      when 'avg_confirmed_deal' then 'round(avg(confirmed_value_inr) filter (where stage=''partner_confirmed''))'
      when 'opportunities' then 'count(*)'
      when 'open_opportunities' then 'count(*) filter (where stage not in (''partner_confirmed'',''lost'',''withdrawn''))'
      when 'open_pipeline_value' then 'coalesce(sum(proposed_value_inr) filter (where stage not in (''partner_confirmed'',''lost'',''withdrawn'')),0)'
      when 'stuck_opportunities' then 'count(*) filter (where stage not in (''partner_confirmed'',''lost'',''withdrawn'') and days_in_stage > 14)'
    end;
  elsif metric in ('qualified_brands','assessed_brands') then
    src := format('qual_snapshot(%L)', as_of);
    allowed := array['qualification_status','source_campaign_name'];
    expr := case metric when 'qualified_brands' then 'count(*) filter (where qualification_status=''qualified'')' else 'count(*)' end;
  elsif metric in ('brands_touched','outreach_attempts','replied_brands','positive_reply_events','meetings_held_brands','opt_out_events','touches') then
    src := format('interactions_asof(%L)', as_of);
    allowed := array['campaign_name','channel','event_type','outcome','owner_id'];
    expr := case metric
      when 'brands_touched' then 'count(distinct brand_id)'
      when 'outreach_attempts' then 'count(distinct attempt_id) filter (where event_type=''outreach_sent'')'
      when 'replied_brands' then 'count(distinct brand_id) filter (where event_type=''replied'')'
      when 'positive_reply_events' then 'count(*) filter (where event_type=''replied'' and outcome=''positive'')'
      when 'meetings_held_brands' then 'count(distinct brand_id) filter (where event_type=''meeting_held'')'
      when 'opt_out_events' then 'count(*) filter (where event_type=''opt_out'')'
      when 'touches' then 'count(*)'
    end;
  else
    raise exception 'Unknown metric %. Allowed: confirmed_partnerships, confirmed_value, avg_confirmed_deal, opportunities, open_opportunities, open_pipeline_value, stuck_opportunities, qualified_brands, assessed_brands, brands_touched, outreach_attempts, replied_brands, positive_reply_events, meetings_held_brands, opt_out_events, touches', metric;
  end if;
  if group_by is not null and not group_by = any(allowed) then
    raise exception 'Cannot group % by %. Allowed: %', metric, group_by, allowed;
  end if;
  for k, v in select * from jsonb_each_text(filters) loop
    if not k = any(allowed) then raise exception 'Cannot filter % by %. Allowed: %', metric, k, allowed; end if;
    cond := cond || format(' and %I = %L', k, v);
  end loop;
  return query execute format('select %s::text, (%s)::numeric, count(*) from %s s where %s group by 1 order by 2 desc',
    coalesce(quote_ident(group_by), '''all'''), expr, src, cond);
end $$;
