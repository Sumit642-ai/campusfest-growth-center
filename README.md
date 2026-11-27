# Sponsor Growth Center · CampusFest

A working growth tool for a college-fest **sponsorship** team (RISA Labs Growth APM take-home, Challenge B). It has a dashboard, campaign and task management, and an AI analyst that answers from live data and shows its working.

**By:** Vinay Raut, IIT Kharagpur

**Links:** App: [campusfest-growth-center-steel.vercel.app](https://campusfest-growth-center-steel.vercel.app) · Walkthrough video: _add Loom link_ · Slides: _add PDF link_

---

## 1. What the 2025 data says

| Finding | Evidence (CampusFest 2025 data) |
|---|---|
| Every confirmed deal came from warm or inbound sources | 24 of 24 confirmed came from Warm Partner Introductions (8), Creator Network Referrals (9) and Partner Interest Form (7) |
| Most of the effort went into cold outreach, which closed nothing | Cold campaigns took 782 of 950 touches (82%) and closed 0 of 33 opportunities |
| ₹14.4L is frozen in the pipeline | 26 open cold deals, none updated after 30 Mar |
| Deals close fast or not at all | Median 10 days to close. Every confirmed deal closed within 13 days |
| The sponsor and attendee sides barely connect | Only 3 of 24 partners were linked to an attendee campaign |

Result: 24 partnerships worth ₹22.4L (₹20.0L cash-type, ₹2.4L in-kind) against a revised target of 28.

### Research behind the plan (sourced vs assumed)

| Question | Answer | Source |
|---|---|---|
| Why Bengaluru | Most colleges of any Indian district (1,106, AISHE 2021-22), about 1.6× the next district. Dense startup, fintech and D2C employers (assumption). Trade-off: Mumbai has more national brand HQs | [Siasat](https://www.siasat.com/no-of-colleges-in-each-district-in-india-know-where-hyderabad-stands-2965076), [Careers360](https://news.careers360.com/up-has-highest-number-of-colleges-in-country-followed-maharashtra-karnataka-aishe-report) |
| Who sponsors fests | 2025-26 title slots went to fintech (NPCI, POP UPI), fashion/D2C (Myntra), recruiters and mobility (Spinny) | [Monumentum](https://monumentum.in/blog/college-fest-sponsors-india) |
| What they want (assumption) | F&B: sampling and Gen Z trial. Mobility/fintech: app installs. Consumer: product trial. Media/education: hiring and sign-ups | Our reading of the rosters, labelled (A) on slide 1 |
| Selection criteria | A warm path exists, the category won in 2025, the ticket fits a tier, and the brand can activate on campus | 2025 data: 24 of 44 warm brands signed; 0 of 136 cold-only brands |
| Funnel benchmarks (borrowed, not India-specific) | Cold email replies about 3–5%; roughly 1% of prospects become sponsors end to end | [Martal](https://martal.ca/b2b-cold-email-statistics-lb/), [Sponsorship Collective](https://sponsorshipcollective.com/blog/know-your-numbers-in-sponsorship/) |

**Sponsor tiers (priced from 2025 deal sizes).** Title, 1 slot, ₹3L+ (new; no 2025 deal was above ₹2L, so this is an assumption). Co-title, 2 slots, ₹1.5–2L (2 deals in 2025). Associate, 8 slots, ₹1–1.5L (8 in 2025). Partner, under ₹1L (14 in 2025). In-kind deals can sit in any tier but never count as cash (4 in 2025). Bet 1's "20% bigger ask" means asking a returning partner to move up one tier.

**2027 base warm list (88 brands):** the 24 past partners, the 20 warm brands that didn't sign in 2025, and 44 new brands from the same three warm channels (8 intros, 19 creator referrals and 17 form leads in 2025). New brands are assumed to get a proposal at 47% and sign at 55%, well below 2025 warm (57% and 96%), because a doubled list is weaker; renewals at 50%. That gives 54 proposals and 28 signed (₹26.6L). Re-running the simulation with close and renewal rates both low (40%, 35%) gives a P50 of ₹31L; both high (70%, 65%) gives ₹50L. Without payment terms (55–70% collected) cash falls to about ₹23L.

**2025 funnel, each rate from the step before:** 180 prospect brands → 109 in conversation (61%) → 46 proposals (42%) → 24 signed (52%; goal 28) → ₹20L cash-type of ₹22.4L confirmed (receipts not tracked). At the same 52% close rate, 38 signed in 2027 needs about 73 proposals.

## 2. How the data is cleaned

- **Duplicates removed** on source IDs: interactions (953 rows become 950), qualification history and opportunity history.
- **As-of logic:** every number is computed for a chosen date. Each entity uses its latest version at or before the end of that day in India time (`cutoff(d)`). Nothing dated later is used, so there's no leakage.
- **Different things are counted separately:** outreach attempts, brands, replies, qualified brands and partnerships each get their own metric.
- **Value is not cash:** confirmed value is what was reported. Cash only comes from our own payments log, and the app labels it that way.
- **Activations are links, not proof:** the app and the analyst never say an activation brought in extra visitors.

## 3. Metric definitions (one function: `query_metric`)

| Metric | Definition |
|---|---|
| confirmed_partnerships | Opportunities whose latest stage on the date is `partner_confirmed` |
| confirmed_value | Sum of `confirmed_value_inr` for those deals (reported value, not cash) |
| open_pipeline_value | Sum of proposed value for deals not confirmed, lost or withdrawn |
| stuck_opportunities | Open deals with no stage change for more than 14 days |
| qualified_brands | Brands whose latest qualification status on the date is `qualified` |
| outreach_attempts | Distinct `attempt_id` with `event_type = outreach_sent` |
| replied_brands / meetings_held_brands | Distinct brands with that event |
| positive_reply_events, opt_out_events, touches | Event counts |

Every metric takes an as-of date, filters and a group-by. Unknown metrics or columns return an error listing what is allowed. That error is how the analyst knows to say "the data can't answer that".

## 4. The model and the bets

- **Base case:** ₹26.6L from 28 deals. That's 12 renewals at a 50% rate plus 16 new warm deals at 55%, and zero from cold outreach.
- **Floor (P10 with no bets working):** ₹21L confirmed and ₹16.5L cash.
- **With the 5 bets, over 20,000 simulated seasons:** P10 ₹30L, P50 ₹40.5L (rounded to ₹41L on the slides) and P90 ₹52L confirmed. Cash before the fest is ₹24L, ₹33L and ₹42L for the same three cases. The top-down ceiling is about ₹64L.
- **Stretch (all 5 bets land):** ₹53.6L signed, about ₹43L cash.

| Funnel step | 2025 actual | 2027 base | 2027 stretch |
|---|---|---|---|
| Prospects (brands) | 180 | 77 (24 renewals + 53 warm) | 129 (+26 zombie deals, more warm) |
| → Conversations | 109 (61%) | 77 (100%; 2025 warm: 44 of 44) | 129 (100%) |
| → Proposals | 46 (42%) | 54 (70%) | 95 (74%) |
| → Signed | 24 (52%) | 28 (52%) | 46 (48%) |
| × Avg deal | ₹93k | ₹95k | ₹1.17L |
| = Signed value | ₹22.4L | ₹26.6L | ₹53.6L |
| × Collected by fest eve | not tracked | 78% (89% cash × 88% on time, A) | 81% (92% × 88%) |
| = Cash collected | no receipts | ₹21L | ₹43L |

**Sponsor segment score (2025 data):** win rate on warm brands × average deal = ₹ per warm prospect. F&B ₹55k, mobility ₹54k, consumer ₹50k, education ₹38k, media ₹36k.

| # | Bet | EV | Budget | Scale if | Stop if |
|---|---|---|---|---|---|
| 1 | Proof Pack renewals (6-partner holdout, read as direction only) | ₹4.0L | ₹30k | ≥ 9 of 18 book a meeting in 7 days | ≤ 4 of 18 |
| 2 | Scale the warm engine | ₹4.6L | ₹60k | ≥ 6.5 new warm brands a week | ≤ 4.6 (2025 pace) |
| 3 | Zombie rescue with AI-drafted proposals | ₹1.5L | ₹20k | ≥ 3 of 10 move a stage | 0 of 10 |
| 4 | Sponsor-funded attendee campaigns | ₹2.1L | ₹30k | ≥ 3 of 8 slots sold | 0 sold by 20 Feb |
| 5 | Category exclusivity auction (net of ₹0.5L lost from brands turned away) | ₹1.6L | ₹45k | 2+ bids in 2 of 3 categories | 0 bids |

Each threshold comes from the bet's break-even. The app turns each bet green, amber or red from its latest reading, and shows "not enough data" until the minimum sample is reached.

**Prioritization framework: expected value per rupee.** Each bet is scored as (chance it works × value if it works) ÷ cost. We picked this over RICE because RICE ignores rupees, and the brief gives a fixed budget ([Intercom on RICE](https://www.intercom.com/blog/rice/)). Ranking: Proof Pack 13×, warm engine 7.7×, zombie rescue 7.3×, co-funding 7.0×, exclusivity auction 3.5×. **Double down** on Bets 1–2, because warm sources closed all 24 deals in 2025. **Rejected:** more cold outreach (0 of 33 closed), paid ads (no 2025 data to size them), and counting barter as cash.

**Dependencies and overlap.** Bet 5 (sealed bids for sole rights in food, mobility and consumer; the floor is the tier price, so the worst case is a normal sale) uses Bet 1's results as proof, so it starts two weeks later. Bets 1 and 5 pitch the same partners, so the auction premium is counted on existing deals, not as new deals. The Proof Pack holdout is only 6 partners, so it is read as direction only; the decision uses the leading signal (meetings within 7 days across all 18). Bet 4 needs the attendee team's campaign slots. Peak team load is 34 hours a week, funded by hours freed from cold outreach; Bet 5 is cut first if the team is overloaded.

**How the simulation works** ([`analysis/simulation.py`](analysis/simulation.py), 20,000 runs, seed 7). Each run decides at random whether each bet works, at its stated chance. Then:
- Renewals: 24 past partners renew at 50% (65% if Proof Pack works), at a ₹93k average deal (×1.2 if the bigger ask works).
- New warm deals: 30 warm proposals (45 if the warm engine works) close at 55%.
- Zombie rescue: 26 frozen deals each close at 20% if the bet works, at ₹70k.
- Co-funding: 6 slots at 67% at ₹1.5L if it works. Exclusivity auction: 3 categories at 90% at a ₹1.48L premium if it works, minus ₹50k from brands we turn away.
- Deal values get ±15% noise. Cash by fest eve is 92% of confirmed value (the cash-type share) × 80–95% paid on time.
The P10, P50 and P90 of the totals give the floor, target and stretch on slide 1. With every bet off, the same model gives the base case.

## 5. The product

| Screen | What it does |
|---|---|
| Mission Control | **What changed this week, and why:** compares the date with 7 days before and lists new partnerships, deals that moved, newly qualified brands and pipeline change, by campaign, with a button to ask the analyst. Also the north-star cash tile, confirmed vs target (the target version changes on 15 Mar), qualified brands, value split, open and weighted pipeline, stuck deals, weekly chart, Monday signals |
| Funnel & Campaigns | 2025: one row per campaign showing each population separately, plus brand → deal, reply and meeting rates (key columns by default, a toggle shows all 14) (warm 41–100% brand → deal, cold 0%); red rows for effort with no deals. **Next season's campaign plan:** add, edit, delete, pause or stop campaigns; set owner, dates, budget, target deals and value, and link a bet; log spend; budget vs spend bars, over-budget flags and totals |
| Pipeline | Kanban by stage with days-in-stage badges. Drag a card or edit a value to add a new history row; a drawer shows the full history |
| Bets & Tasks | Bet cards with live scale/change/stop calls, a form to add readings, and a task list (AI-drafted tasks are tagged) |
| Cash & Scenarios | Payments log against confirmed cash deals (seeded with **demo payments**: assumed terms of 50% within 7 days of signing and 50% by 1 Apr, 2 in 10 balances still unpaid; labelled "demo seed" and the analyst says so), assumptions tagged data vs assumption, and a 5,000-run simulator |

**Campaign plan (seeded, editable).** Budgets add up to the ₹1.85L work budget on slide 2; deal targets add up to 38, the P50 on slide 1, at the 2025 average deal of about ₹93k. Planned value adds up to ₹40.9L, which matches the ₹41L P50 target: Proof Pack renewals are planned at one tier up (14 × about ₹1.12L).

| Campaign | Owner | Budget | Target deals | Built on (2025) |
|---|---|---|---|---|
| Creator & alumni referrals (Bet 2) | Nisha Rao | ₹35,000 | 8 | 72 touches, 9 deals |
| Warm partner introductions (Bet 2) | Riya Kapoor | ₹25,000 | 7 | 34 touches, 8 deals |
| Partner interest form | Kabir Shah | ₹0 | 5 | 62 touches, 7 deals |
| Proof Pack renewals (Bet 1) | Meera Iyer | ₹30,000 | 14 | 3 of 24 partners activated |
| Zombie rescue, AI drafts (Bet 3) | Riya Kapoor | ₹20,000 | 2 | 26 frozen deals, ₹14.4L |
| Sponsor-funded attendee campaigns (Bet 4) | Meera Iyer | ₹30,000 | 2 | 3 sponsor–attendee links |
| Category exclusivity auction (Bet 5) | Riya Kapoor | ₹45,000 | 0 (premium on existing deals) | 6 food, 5 mobility, 5 consumer brands in 2025 |
| Brand discovery email | Kabir Shah | ₹0, **stopped** | 0 | 507 touches, 0 deals |

Spend logged on a campaign also counts toward its bet's budget on the Bets page. The reset button restores this plan.

**Design choices**
- **The as-of date** sits on every screen and opens on 15 Mar 2025 (mid-season, so there is still work to do). Quick buttons jump to 15 Feb, 15 Mar, 11 Apr and 20 Apr.
- **Campaign clock:** the data is from 2025, so new edits are stamped on the clock date (default 20 Apr 2025, 23:00 IST). That way they show up in the 2025 timeline. Earlier as-of dates still show what was true then.
- **Append-only edits:** source tables are never changed. Edits go into `app_opp_history` and are merged in through views. A reset button removes all app edits.

**One complete workflow (the Loom shows the same steps)**
1. **See the problem.** Mission Control, as of 20 Mar 2025: the weekly drivers panel shows the 3 signings came from warm campaigns, while cold campaigns only moved deals a stage.
2. **Find the cause.** Funnel & Campaigns: cold campaigns took 82% of touches and closed 0 of 33.
3. **Ask the analyst.** "Zombie rescue isn't working, stop it and move its budget to warm intros." It reads the campaign plan through its tools, and "Show working" lists each call.
4. **Act.** It returns two draft cards (status → stopped, budget ₹25k → ₹45k). Click Confirm; the campaign plan and budget totals update, and the change is logged.
5. **Follow up.** Ask it to draft a task for the owner; confirm it, and it appears on Bets & Tasks. Log a bet reading there, and the bet card turns scale, change or stop from its pre-set threshold.

**Ask the Analyst** (Supabase Edge Function plus Gemini tool calling)
- It has 9 tools: `query_metric`, `list_opportunities`, `get_opportunity_history`, `get_target`, `evaluate_bets`, `get_app_table`, `run_sql` (a read-only fallback that blocks raw history tables and writes), `propose_task` and `propose_campaign_change`.
- The model never does arithmetic. Every number comes from a database call, and the "Show working" panel lists each call.
- Answers follow a fixed format: Answer, Evidence, Calculation, Source/app/assumption, Confidence, Next step.
- `propose_task` and `propose_campaign_change` only create drafts. A person clicks Confirm to save them. Example (tested live): "Zombie rescue isn't working, stop it and move its budget to warm intros" gives two draft cards, status planned → stopped and budget ₹25,000 → ₹45,000; Confirm writes them to the campaign plan and the totals update.
- It reads next season's campaign plan and spend (`v_campaign_budget`, `v_campaign_budget_totals`), so it can answer "which campaign is over budget?" and draft a follow-up task. For 2025 spend it says the data doesn't track it, because the source has none.

## 6. Testing

`tests/answer_key.json` holds 18 questions. `tests/run_tests.mjs` asks the live analyst each one and checks the answer against numbers it computes from the database at that moment. Because of that, the test still works after the data changes.

`tests/edits_for_retest.sql` makes 6 scripted edits: confirm, withdraw, revalue, lose, confirm, and add a payment. After them:

| Metric | Original | After edits |
|---|---|---|
| Confirmed partnerships, 11 Apr | 24 | 25 |
| Confirmed value, 11 Apr | ₹22,40,000 | ₹22,20,000 |
| Open pipeline, 11 Apr | ₹14,40,000 | ₹14,30,000 |
| Confirmed, 15 Mar | 17 | 17 (unchanged: April edits don't rewrite March) |

**Results (live, on Supabase + Gemini, 26 Nov 2026):**
- Original data: **18 of 18 passed**.
- After the 6 edits: **17 of 18 passed**. The miss was a correct refusal worded in a way the checker didn't expect. The system prompt now uses a fixed refusal line, "The data doesn't track this."
- A later run hit Google's free-tier "model overloaded" errors on 5 questions. Those answers were correct when re-asked. The runner now retries busy replies, and the app falls back to backup Gemini models.
- After adding campaign management (26 Nov 2026): 17 of 18. The miss was real: the analyst read the metric's row count (950 interactions) instead of its value (322 outreach attempts). Fixed by returning only the value from `query_metric`; the re-run passed **18 of 18**.
- After seeding demo payments (27 Nov 2026): 17 of 18. The miss was real: Gemini called a tool and then returned no text. The analyst now asks the model once more when that happens; the failed question then passed twice in a row.
- Budget questions on the new campaign plan were checked live: it found the over-budget campaign from `v_campaign_budget`, took totals from `v_campaign_budget_totals` instead of adding rows itself, drafted a follow-up task, and said "the data doesn't track this" when asked for 2025 spend.
- _Add the score on 10 unseen questions from a friend here._

## 7. Setup

```bash
npm install
cp .env.example .env.local      # add your Supabase URL and anon key
npm run dev
```

Database: run `supabase/sql/01` to `08` in order (or paste `supabase/full_setup.sql` once) in the Supabase SQL Editor, then load `data/*.csv` into the matching `src_*` tables. Or use the Management API script:

```bash
SUPABASE_ACCESS_TOKEN=... node scripts/setup_supabase.mjs <project-ref>
```

**Note for reviewers:** the AI analyst runs on Google's free Gemini tier. At busy times a reply can take 30 to 60 seconds, or ask you to try again; the function falls back to backup Gemini models automatically.

Analyst: set the `GEMINI_API_KEY` secret in Supabase (Edge Functions, then Secrets). It's deployed by the script above, or with `supabase functions deploy analyst`. No keys are stored in this repo.

## 8. Tools, sources and what was reused

| Tool | Plan | Used for |
|---|---|---|
| React + Vite + TypeScript, Recharts | Free, open source | The app and charts |
| Supabase (Postgres, Edge Functions) | Free plan | Data, metric functions, row-level security, the analyst function |
| Google Gemini API | Free tier (slow: 80–90 s per answer; billing recommended) | Tool calling for the analyst |
| Vercel | Hobby (free) | Hosting |
| Claude (AI coding help) | Paid | Help writing code, SQL and the slide layout |
| Python (numpy, pandas) | Free | Data analysis and the 20,000-run simulation |

**Reused, modified, verified**
- **Reused:** the CampusFest 2025 dataset from the brief (loaded as read-only `src_*` tables); open-source libraries above; public sources linked in the research table.
- **Modified:** the data is cleaned through views (duplicates removed, history merged), and app edits are append-only rows, so the source data is never changed.
- **Verified:** every number on the slides was recomputed from the data with scripts ([`analysis/dataset_analysis.py`](analysis/dataset_analysis.py)). The analyst passed 18 of 18 live tests (section 6). AI-written code was read, type-checked and tested against the live database before use.

## 9. Known limitations

- There's no 2025 spend data and no bank receipts, so cash depends on the payments log, and budgets/spend exist only for next season's plan (seeded from the ₹1.85L work budget; spend starts at zero).
- The renewal rate is assumed, because 2025 has no renewal history.
- Activation impact is unknown (association only).
- The holdout is small (6 vs 18), so its result shows a direction, not statistical proof.
- Bet readings in the app are labelled demo readings, because next season hasn't happened yet.
