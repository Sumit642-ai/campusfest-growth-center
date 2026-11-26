# Sponsor Growth Center · CampusFest

A working growth tool for a college-fest **sponsorship** team (RISA Labs Growth APM take-home, Challenge B). It has a dashboard, campaign and task management, and an AI analyst that answers from live data and shows its working.

**By:** Vinay Raut, IIT Kharagpur

**Links:** App: _add Vercel link_ · Walkthrough video: _add Loom link_ · Slides: _add PDF link_

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
- **With the 5 bets, over 20,000 simulated seasons:** P10 ₹31L, P50 ₹41L and P90 ₹52L confirmed. Cash before the fest is ₹24L, ₹33L and ₹42L for the same three cases. The top-down ceiling is about ₹64L.

| # | Bet | EV | Budget | Scale if | Stop if |
|---|---|---|---|---|---|
| 1 | Proof Pack renewals, with a 6-partner holdout | ₹4.0L | ₹30k | Gap vs holdout ≥ 15 pts | Gap ≤ 0 |
| 2 | Scale the warm engine | ₹4.6L | ₹60k | ≥ 6.5 new warm brands a week | ≤ 4.6 (2025 pace) |
| 3 | Zombie rescue with AI-drafted proposals | ₹1.5L | ₹20k | ≥ 3 of 10 move a stage | 0 of 10 |
| 4 | Sponsor-funded attendee campaigns | ₹2.1L | ₹30k | ≥ 3 of 8 slots sold | 0 sold by 20 Feb |
| 5 | Outcome add-ons | ₹1.8L | ₹45k | ≥ 4 of 10 say yes | ≤ 1 |

Each threshold comes from the bet's break-even. The app turns each bet green, amber or red from its latest reading, and shows "not enough data" until the minimum sample is reached.

## 5. The product

| Screen | What it does |
|---|---|
| Mission Control | North-star cash tile, confirmed vs target (the target version changes on 15 Mar), qualified brands, value split, open and weighted pipeline, stuck deals, weekly chart, Monday signals |
| Funnel & Campaigns | 2025: one row per campaign showing each population separately, plus brand → deal, reply and meeting rates (warm 41–100% brand → deal, cold 0%); red rows for effort with no deals. **Next season's campaign plan:** add, edit, delete, pause or stop campaigns; set owner, dates, budget, target deals and value, and link a bet; log spend; budget vs spend bars, over-budget flags and totals |
| Pipeline | Kanban by stage with days-in-stage badges. Drag a card or edit a value to add a new history row; a drawer shows the full history |
| Bets & Tasks | Bet cards with live scale/change/stop calls, a form to add readings, and a task list (AI-drafted tasks are tagged) |
| Cash & Scenarios | Payments log against confirmed cash deals, assumptions tagged data vs assumption, and a 5,000-run simulator |

**Campaign plan (seeded, editable).** Budgets add up to the ₹1.85L work budget on slide 2; deal targets add up to 38, the P50 on slide 1, at the 2025 average deal of about ₹93k.

| Campaign | Owner | Budget | Target deals | Built on (2025) |
|---|---|---|---|---|
| Creator & alumni referrals (Bet 2) | Nisha Rao | ₹35,000 | 8 | 72 touches, 9 deals |
| Warm partner introductions (Bet 2) | Riya Kapoor | ₹25,000 | 7 | 34 touches, 8 deals |
| Partner interest form | Kabir Shah | ₹0 | 5 | 62 touches, 7 deals |
| Proof Pack renewals (Bet 1) | Meera Iyer | ₹30,000 | 14 | 3 of 24 partners activated |
| Zombie rescue, AI drafts (Bet 3) | Riya Kapoor | ₹20,000 | 2 | 26 frozen deals, ₹14.4L |
| Sponsor-funded attendee campaigns (Bet 4) | Meera Iyer | ₹30,000 | 2 | 3 sponsor–attendee links |
| Outcome add-ons (Bet 5) | Riya Kapoor | ₹45,000 | 0 (adds value to existing deals) | little measurable value |
| Brand discovery email | Kabir Shah | ₹0, **stopped** | 0 | 507 touches, 0 deals |

Spend logged on a campaign also counts toward its bet's budget on the Bets page. The reset button restores this plan.

**Design choices**
- **The as-of date** sits on every screen. Quick buttons jump to 15 Feb, 15 Mar, 11 Apr and 20 Apr.
- **Campaign clock:** the data is from 2025, so new edits are stamped on the clock date (default 20 Apr 2025, 23:00 IST). That way they show up in the 2025 timeline. Earlier as-of dates still show what was true then.
- **Append-only edits:** source tables are never changed. Edits go into `app_opp_history` and are merged in through views. A reset button removes all app edits.

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
- Budget questions on the new campaign plan were checked live: it found the over-budget campaign from `v_campaign_budget`, took totals from `v_campaign_budget_totals` instead of adding rows itself, drafted a follow-up task, and said "the data doesn't track this" when asked for 2025 spend.
- _Add the score on 10 unseen questions from a friend here._

## 7. Setup

```bash
npm install
cp .env.example .env.local      # add your Supabase URL and anon key
npm run dev
```

Database: run `supabase/sql/01` to `07` in order (or paste `supabase/full_setup.sql` once) in the Supabase SQL Editor, then load `data/*.csv` into the matching `src_*` tables. Or use the Management API script:

```bash
SUPABASE_ACCESS_TOKEN=... node scripts/setup_supabase.mjs <project-ref>
```

**Note for reviewers:** the AI analyst runs on Google's free Gemini tier. At busy times a reply can take 30 to 60 seconds, or ask you to try again; the function falls back to backup Gemini models automatically.

Analyst: set the `GEMINI_API_KEY` secret in Supabase (Edge Functions, then Secrets). It's deployed by the script above, or with `supabase functions deploy analyst`. No keys are stored in this repo.

## 8. Tools used

React + Vite + TypeScript, Supabase (Postgres, Edge Functions), Gemini, Recharts, and Vercel. Built with AI coding help (Claude). The analysis, metric definitions and bet logic were checked against the data with scripts.

## 9. Known limitations

- There's no 2025 spend data and no bank receipts, so cash depends on the payments log, and budgets/spend exist only for next season's plan (seeded from the ₹1.85L work budget; spend starts at zero).
- The renewal rate is assumed, because 2025 has no renewal history.
- Activation impact is unknown (association only).
- The holdout is small (6 vs 18), so its result shows a direction, not statistical proof.
- Bet readings in the app are labelled demo readings, because next season hasn't happened yet.
