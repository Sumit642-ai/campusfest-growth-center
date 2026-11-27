import pandas as pd
pd.set_option('display.width',250); pd.set_option('display.max_columns',30)
x={k:v.dropna(how='all') for k,v in pd.read_excel('Sponsor_Dataset.xlsx',sheet_name=None).items()}
i=x['Sponsor interactions'].drop_duplicates('interaction_id')
print(i.groupby(['event_type','outcome']).size())
# per campaign funnel at brand level
def nb(df): return df.brand_id.nunique()
rows=[]
for cn,g in i.groupby('campaign_name'):
    rows.append(dict(campaign=cn,touched=nb(g),
      sends=(g.event_type=='outreach_sent').sum(),
      delivered=nb(g[g.event_type=='delivered']),
      replied=nb(g[g.event_type=='replied']),
      positive=nb(g[(g.event_type=='replied')&(g.outcome=='positive')]),
      intro=nb(g[g.event_type.isin(['introduction_received','web_inbound'])]),
      booked=nb(g[g.event_type=='meeting_booked']),
      held=nb(g[g.event_type=='meeting_held']),
      optout=nb(g[g.event_type=='opt_out'])))
print(pd.DataFrame(rows).to_string())
print('total brands touched',nb(i), 'of', len(x['Brands']))
q=x['Brand qualification']; print('q dup',q.history_id.duplicated().sum()); q=q.drop_duplicates('history_id')
ql=q.sort_values('effective_at').groupby('brand_id').tail(1)
print('latest qual',ql.qualification_status.value_counts().to_dict(), 'brands w/ qual', len(ql))
print(pd.crosstab(ql.source_campaign_name, ql.qualification_status, margins=True))
o=x['Partner opportunities']; print(o.support_type.value_counts(), o.originating_campaign_name.value_counts())
h=x['Opportunity history']; print('h dup',h.history_id.duplicated().sum()); h=h.drop_duplicates('history_id')
hl=h.sort_values('effective_at').groupby('opportunity_id').tail(1).merge(o[['opportunity_id','support_type','originating_campaign_name']],on='opportunity_id')
print(hl.stage.value_counts())
print(hl.groupby('stage')[['proposed_value_inr','confirmed_value_inr']].agg(['sum','mean','count']))
print(pd.crosstab(hl.originating_campaign_name, hl.stage, margins=True))
print(hl.groupby(['support_type','stage']).confirmed_value_inr.agg(['sum','count']))
conf=hl[hl.stage=='partner_confirmed']
print('confirmed',len(conf),conf.confirmed_value_inr.sum(), conf.confirmed_value_inr.describe())
print(conf.groupby('originating_campaign_name').confirmed_value_inr.agg(['sum','count','mean']))
print('brands with multiple opps', o.brand_id.duplicated().sum())
print(x['Sponsor activations'].to_string())
print(hl.groupby('owner_name').stage.value_counts().unstack(fill_value=0))
b=x['Brands'][['brand_id','industry']]
print(pd.crosstab(hl.merge(b,on='brand_id').industry, hl.merge(b,on='brand_id').stage, margins=True))
print(conf.merge(b,on='brand_id').groupby('industry').confirmed_value_inr.agg(['sum','count']))
import pandas as pd
pd.set_option('display.width',250); pd.set_option('display.max_columns',30); pd.set_option('display.max_rows',100)
x={k:v.dropna(how='all') for k,v in pd.read_excel('Sponsor_Dataset.xlsx',sheet_name=None).items()}
h=x['Opportunity history'].drop_duplicates('history_id'); o=x['Partner opportunities']
print(h[h.brand_name=='Beardo'].sort_values('effective_at')[['stage','proposed_value_inr','confirmed_value_inr','effective_at']])
print(x['Brand qualification'][x['Brand qualification'].brand_name=='Beardo'].sort_values('effective_at')[['qualification_status','reason','effective_at']].to_string())
first=h.groupby('opportunity_id').effective_at.min()
conf=h[h.stage=='partner_confirmed'].groupby('opportunity_id').effective_at.min()
d=(conf-o.set_index('opportunity_id').created_at.reindex(conf.index)).dt.days
print('days created->confirmed',d.describe())
print('confirm dates by week'); print(conf.dt.to_period('W').value_counts().sort_index())
# stage path
for st in ['prospecting','contacted','proposal_sent','negotiating','partner_confirmed','lost']:
    print(st, h[h.stage==st].opportunity_id.nunique())
# value changes proposed vs confirmed
hl=h.sort_values('effective_at').groupby('opportunity_id')
fp=hl.proposed_value_inr.first(); lp=hl.tail(1).set_index('opportunity_id')
print('first proposed vs final for confirmed', fp[lp.stage=='partner_confirmed'].sum(), lp[lp.stage=='partner_confirmed'].confirmed_value_inr.sum())
# opps whose last update is old (stuck) as of 2025-04-10
last=lp[~lp.stage.isin(['partner_confirmed','lost','withdrawn'])]
print(last[['brand_name','stage','proposed_value_inr','effective_at','owner_name']].sort_values('effective_at'))
# qualification by date snapshot: qualified count at end of month
q=x['Brand qualification'].drop_duplicates('history_id')
for dt in ['2025-02-15','2025-03-15','2025-04-11','2025-04-20']:
    c=pd.Timestamp(dt)+pd.Timedelta(hours=23,minutes=59)
    s=q[q.effective_at<=c].sort_values('effective_at').groupby('brand_id').tail(1)
    hh=h[h.effective_at<=c].sort_values('effective_at').groupby('opportunity_id').tail(1)
    print(dt,'qualified',(s.qualification_status=='qualified').sum(),'confirmed',(hh.stage=='partner_confirmed').sum(),'conf value',hh.confirmed_value_inr.sum(),'open pipeline',hh[~hh.stage.isin(['partner_confirmed','lost','withdrawn'])].proposed_value_inr.sum())
print(q.effective_at.max(), h.effective_at.max(), x['Sponsor interactions'].occurred_at.max())
ii=x['Sponsor interactions'].drop_duplicates('interaction_id')
print('meetings held total brands', ii[ii.event_type=='meeting_held'].brand_id.nunique())
print('qualified brands with opp', q.sort_values('effective_at').groupby('brand_id').tail(1).query("qualification_status=='qualified'").brand_id.isin(o.brand_id).sum())
print(x['Sponsor contacts'].job_title.value_counts())
print(o[o.support_type=='in_kind'][['brand_name','originating_campaign_name']])
