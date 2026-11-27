import type { ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { metric, metricValue, rpc, sb, table } from "../lib/supabase";
import { FEST_EVE, seasonOver, useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { addDays, daysBetween, fmtDate, inr, inrShort } from "../lib/format";
import { ErrorBox, Loading, Tile } from "../components/ui";
import WeekDrivers from "../components/WeekDrivers";

type Target = { qualified_brands_goal: number; confirmed_partnerships_goal: number; target_version: string };
const STAGE_ORDER = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed"];

export default function MissionControl() {
  const { asOf, version, ask } = useApp();
  const s = useAsync(async () => {
    const [target, confirmed, bySupport, qualified, openValue, openCount, stuck, payments, weekAgo] = await Promise.all([
      rpc<Target[]>("target_in_force", { d: asOf }),
      metricValue("confirmed_partnerships", asOf),
      metric("confirmed_value", asOf, {}, "support_type"),
      metricValue("qualified_brands", asOf),
      metricValue("open_pipeline_value", asOf),
      metricValue("open_opportunities", asOf),
      metricValue("stuck_opportunities", asOf),
      table<{ amount_inr: number; paid_on: string | null }>("payments"),
      metricValue("confirmed_partnerships", addDays(asOf, -7)),
    ]);
    const cash = bySupport.find((r) => r.grp === "cash")?.value ?? 0;
    const inKind = bySupport.find((r) => r.grp === "in_kind")?.value ?? 0;
    const upTo = asOf < FEST_EVE ? asOf : FEST_EVE; // the north star counts cash in the bank by fest eve
    const paid = payments.filter((p) => p.paid_on && p.paid_on <= upTo).reduce((a, p) => a + Number(p.amount_inr), 0);
    return { target: target[0], confirmed, cash, inKind, qualified, openValue, openCount, stuck, paid, newThisWeek: confirmed - weekAgo };
  }, [asOf, version]);

  const weekly = useAsync(async () => {
    const rows = await rpc<{ week_end: string; confirmed: number; goal: number }[]>("weekly_confirmed", { as_of: asOf });
    return rows.map((r) => ({ d: fmtDate(r.week_end).replace(/ \d{4}$/, ""), confirmed: Number(r.confirmed), goal: r.goal }));
  }, [asOf, version]);

  const coverage = useAsync(() => weightedPipeline(asOf), [asOf, version]);

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const d = s.data, t = d.target;
  const day = fmtDate(asOf);
  const remaining = t ? Math.max(0, t.confirmed_partnerships_goal - d.confirmed) : 0;
  const over = seasonOver(asOf);
  const goal = t?.confirmed_partnerships_goal ?? 0;
  // Pace needed: deals still to sign ÷ weeks left until fest eve.
  const weeksLeft = Math.max(0, daysBetween(asOf, FEST_EVE)) / 7;
  const pace = remaining > 0 && weeksLeft > 0 ? remaining / weeksLeft : 0;
  const cov = coverage.data;
  const covRatio = cov && remaining > 0 ? cov.weightedDeals / remaining : null;
  const tilePill = (n: number, g: number) => n >= g ? <span className="pill green">On target</span> : over ? <span className="pill red">Missed by {g - n}</span> : <span className="pill amber">{g - n} to go</span>;

  return (
    <>
      <h1>Mission Control</h1>
      <p className="sub">Where the sponsorship season stands on {day}. Every number is computed in the database for this date only. Nothing after it is used.</p>
      {over && (
        <div className="note season">
          <b>Season over.</b> The fest ran 12–13 Apr 2025, so targets are now final. Result: {d.confirmed} of {goal} partnerships
          ({d.confirmed >= goal ? "target met" : `missed by ${remaining}`}), {inrShort(d.paid)} cash collected by fest eve of {inrShort(d.cash)} confirmed cash-type value
          {cov ? <>, and {cov.withdrawn.length} confirmed {cov.withdrawn.length === 1 ? "deal" : "deals"} later withdrawn</> : null}.
          Signals below are shown as a retrospective, not as actions.{" "}
          <button className="linkbtn" onClick={() => ask(`Give a season retrospective as of ${asOf}: final partnerships and value versus target, what worked, what failed, and the 3 lessons for next season.`)}>Ask for a retrospective →</button>
        </div>
      )}
      <div className="kpis">
        <Tile hero label="North star · cash paid by fest eve" value={inrShort(d.paid)}
          hint={<>From our payments log, not in source data. Confirmed cash-type value is {inrShort(d.cash)}.</>}
          onExplain={() => ask(`How much cash has actually been collected as of ${asOf}?`)}>
          <div className="bar light"><i style={{ width: `${d.cash ? Math.min(100, (d.paid / d.cash) * 100) : 0}%` }} /></div>
          <div className="hint" style={{ marginTop: 4 }}>{d.cash ? Math.round((d.paid / d.cash) * 100) : 0}% of confirmed cash-type value is in the bank</div>
          <dl className="hero-kv">
            <dt>Still to collect</dt><dd>{inrShort(Math.max(0, d.cash - d.paid))}</dd>
            <dt>Fest eve</dt><dd>{fmtDate(FEST_EVE)}{over ? " (passed)" : ` · ${daysBetween(asOf, FEST_EVE)} days left`}</dd>
            <dt>Plan for 2027</dt><dd>₹33L in the bank by fest eve (P50)</dd>
          </dl>
        </Tile>
        <Tile label="Confirmed partnerships" value={<>{d.confirmed}<span className="muted" style={{ fontSize: 16 }}> / {t?.confirmed_partnerships_goal}</span></>}
          hint={<>{t?.target_version} · {d.newThisWeek} new in the last 7 days</>} progress={t ? d.confirmed / t.confirmed_partnerships_goal : 0}
          onExplain={() => ask(`Explain confirmed partnerships as of ${asOf}: how many, from which campaigns, versus target.`)}>
          <div style={{ marginTop: 6 }}>{tilePill(d.confirmed, goal)}</div>
        </Tile>
        <Tile label="Qualified brands" value={<>{d.qualified}<span className="muted" style={{ fontSize: 16 }}> / {t?.qualified_brands_goal}</span></>}
          hint={t?.target_version} progress={t ? d.qualified / t.qualified_brands_goal : 0}
          onExplain={() => ask(`Explain qualified brands as of ${asOf} and which campaigns they came from.`)}>
          <div style={{ marginTop: 6 }}>{d.qualified >= (t?.qualified_brands_goal ?? 0) ? <span className="pill green">On target</span> : <span className={`pill ${over ? "red" : "amber"}`}>{over ? "Missed" : "Below target"}</span>}</div>
        </Tile>
        <Tile label="Confirmed value" value={inrShort(d.cash + d.inKind)} hint={<>Cash-type {inrShort(d.cash)} · in-kind {inrShort(d.inKind)} (reported value, not money received)</>}
          onExplain={() => ask(`Break down confirmed value as of ${asOf} by support type and campaign.`)} />
        <Tile label="Open pipeline" value={inrShort(d.openValue)} hint={<>{d.openCount} open deals at proposed value</>}
          onExplain={() => ask(`What is in the open pipeline as of ${asOf}, and what can realistically close?`)} />
        <Tile label="Stuck deals" value={d.stuck} hint="Open and no stage change for over 14 days. Every 2025 deal that closed did so within 13 days."
          onExplain={() => ask(`Which deals are stuck as of ${asOf} and what should we do about them?`)} />
        <Tile label="Weighted pipeline" value={over ? "₹0" : cov ? inrShort(cov.weighted) : "…"}
          hint={over ? "Season over: open deals can no longer help this fest." : cov ? <>Open value × chance of closing from each stage, learned from history up to this date. {cov.note} Deals idle over 14 days count as 0%, since no 2025 deal closed after 13.</> : "Computing…"}
          onExplain={() => ask(`What is our weighted pipeline as of ${asOf}, and is it enough to hit target?`)} />
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Confirmed partnerships vs target, week by week</h2>
          {weekly.data ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={weekly.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} interval={weekly.data.length > 9 ? 1 : 0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, 28]} ticks={[0, 4, 8, 12, 16, 20, 24, 28]} />
                <Tooltip formatter={(v, n) => [v, n]} labelFormatter={(l) => `Week ending ${l}`} />
                <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line type="stepAfter" dataKey="goal" name="Target (20, then 28 from 15 Mar)" stroke="#a3a9b8" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="confirmed" name="Confirmed partnerships (end of week)" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Loading />}
          <p className="small muted">One point per week (count at the end of that week, straight lines between weeks). The target changes on 15 Mar 2025 when the team moved from the launch plan (20) to the revised plan (28).</p>
        </div>
        <div className="card">
          <h2>{over ? "Season signals (retrospective)" : "Monday signals"}</h2>
          <table className="t">
            <tbody>
              <Signal over={over} name="Confirmations in the last 7 days" value={String(d.newThisWeek)} ok={remaining === 0 || (weeksLeft > 0 && d.newThisWeek >= pace)}
                rule={remaining === 0 ? "Target met." : weeksLeft <= 0 ? `No time left before the fest: finished ${remaining} short of the target of ${goal}.` : `Needed pace: ${remaining} to go ÷ ${weeksLeft.toFixed(1)} weeks to fest eve = ${pace.toFixed(1)} a week. OK if this week's count meets it.`} />
              <Signal over={over} name="Expected deals ÷ deals still needed" value={remaining === 0 ? "Target met" : over ? "–" : covRatio != null ? `${covRatio.toFixed(1)}×` : "…"}
                ok={remaining === 0 || (covRatio != null ? covRatio >= 1.5 : true)} rule={over && remaining > 0 ? "Season over: the open pipeline can no longer close in time." : cov && remaining > 0 ? `${cov.weightedDeals.toFixed(1)} deals expected from the open pipeline ÷ ${remaining} still needed. Should be at least 1.5×.` : "Expected deals from the open pipeline should be at least 1.5× what's left."} />
              <Signal over={over} name="Stuck deals (14+ days)" value={String(d.stuck)} ok={d.stuck <= 3} rule={<>Each one gets a task (one click on the <a href="#pipeline">Pipeline</a> page); 21+ days triggers a lost review.</>} />
              <Signal over={over} name="Confirmed deals later withdrawn or lost" value={cov ? String(cov.withdrawn.length) : "…"} ok={!cov || cov.withdrawn.length === 0}
                rule={cov && cov.withdrawn.length ? `${cov.withdrawn.map((w) => `${w.brand} (${inrShort(w.value)}, ${w.stage})`).join(", ")}. Call the brand and find out why within 48 hours.` : "A signed deal that falls through. None so far."} />
              <Signal over={over} name="Cash paid ÷ confirmed cash-type value" value={d.cash ? `${Math.round((d.paid / d.cash) * 100)}%` : "–"} ok={d.cash === 0 || d.paid / d.cash >= 0.5}
                rule="Our own payments log (demo data). The source data has no bank receipts." />
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Confirmed value {inr(d.cash + d.inKind)} as of {day}.</p>
        </div>
      </div>
      <WeekDrivers />
    </>
  );
}

function Signal({ name, value, ok, rule, over }: { name: string; value: string; ok: boolean; rule: ReactNode; over?: boolean }) {
  return (
    <tr>
      <td><b>{name}</b><div className="small muted">{rule}</div></td>
      <td className="r" style={{ whiteSpace: "nowrap" }}>{value} {over ? <span className={`pill ${ok ? "green" : "grey"}`}>{ok ? "Met" : "Missed"}</span> : <span className={`pill ${ok ? "green" : "red"}`}>{ok ? "OK" : "Act"}</span>}</td>
    </tr>
  );
}

/** Chance of ending confirmed, by the furthest stage a deal reached, learned from history known on the date. */
async function weightedPipeline(asOf: string) {
  const [snap, hist] = await Promise.all([
    rpc<{ opportunity_id: string; stage: string; proposed_value_inr: number; confirmed_value_inr: number; brand_name: string; days_in_stage: number }[]>("opp_snapshot", { d: asOf }),
    sb.from("v_opp_history").select("opportunity_id, stage, effective_at").lt("effective_at", cutoffIso(asOf)),
  ]);
  if (hist.error) throw new Error(hist.error.message);
  const reached = new Map<string, Set<string>>();
  for (const h of hist.data ?? []) {
    if (!reached.has(h.opportunity_id)) reached.set(h.opportunity_id, new Set());
    reached.get(h.opportunity_id)!.add(h.stage);
  }
  const final = new Map(snap.map((o) => [o.opportunity_id, o.stage]));
  const chance: Record<string, number> = {};
  for (const st of STAGE_ORDER.slice(0, 4)) {
    const ids = [...reached].filter(([, s]) => s.has(st)).map(([id]) => id);
    chance[st] = ids.length ? ids.filter((id) => final.get(id) === "partner_confirmed").length / ids.length : 0;
  }
  let weighted = 0, weightedDeals = 0;
  for (const o of snap) {
    let c = chance[o.stage];
    if (c == null) continue; // closed deals
    if (Number(o.days_in_stage) > 14) c = 0; // stale: every 2025 deal that closed did so within 13 days
    weighted += c * Number(o.proposed_value_inr);
    weightedDeals += c;
  }
  const note = `Negotiating ${Math.round(chance.negotiating * 100)}%, proposal ${Math.round(chance.proposal_sent * 100)}%.`;
  // Signed deals that later fell through (reached Confirmed, now Lost or Withdrawn).
  const withdrawn = snap.filter((o) => (o.stage === "withdrawn" || o.stage === "lost") && reached.get(o.opportunity_id)?.has("partner_confirmed"))
    .map((o) => ({ brand: o.brand_name, value: Number(o.proposed_value_inr), stage: o.stage }));
  return { weighted, weightedDeals, chance, note, withdrawn };
}
function cutoffIso(d: string) {
  return `${addDays(d, 1)}T00:00:00+05:30`;
}
