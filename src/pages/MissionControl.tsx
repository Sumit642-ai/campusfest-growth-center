import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { metric, metricValue, rpc, sb, table } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { addDays, fmtDate, inr, inrShort } from "../lib/format";
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
    const paid = payments.filter((p) => p.paid_on && p.paid_on <= asOf).reduce((a, p) => a + Number(p.amount_inr), 0);
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

  return (
    <>
      <h1>Mission Control</h1>
      <p className="sub">Where the sponsorship season stands on {day}. Every number is computed in the database for this date only. Nothing after it is used.</p>
      <div className="grid g4">
        <Tile hero label="North star · cash paid by fest eve" value={inrShort(d.paid)}
          hint={<>From our payments log, not in source data. Confirmed cash-type value is {inrShort(d.cash)}.</>}
          onExplain={() => ask(`How much cash has actually been collected as of ${asOf}?`)} />
        <Tile label="Confirmed partnerships" value={<>{d.confirmed}<span className="muted" style={{ fontSize: 16 }}> / {t?.confirmed_partnerships_goal}</span></>}
          hint={<>{t?.target_version} · {d.newThisWeek} new in the last 7 days</>} progress={t ? d.confirmed / t.confirmed_partnerships_goal : 0}
          onExplain={() => ask(`Explain confirmed partnerships as of ${asOf}: how many, from which campaigns, versus target.`)}>
          <div style={{ marginTop: 6 }}><span className={`pill ${d.confirmed >= (t?.confirmed_partnerships_goal ?? 0) ? "green" : "amber"}`}>{d.confirmed >= (t?.confirmed_partnerships_goal ?? 0) ? "On target" : `${remaining} to go`}</span></div>
        </Tile>
        <Tile label="Qualified brands" value={<>{d.qualified}<span className="muted" style={{ fontSize: 16 }}> / {t?.qualified_brands_goal}</span></>}
          hint={t?.target_version} progress={t ? d.qualified / t.qualified_brands_goal : 0}
          onExplain={() => ask(`Explain qualified brands as of ${asOf} and which campaigns they came from.`)}>
          <div style={{ marginTop: 6 }}><span className={`pill ${d.qualified >= (t?.qualified_brands_goal ?? 0) ? "green" : "amber"}`}>{d.qualified >= (t?.qualified_brands_goal ?? 0) ? "On target" : "Below target"}</span></div>
        </Tile>
        <Tile label="Confirmed value" value={inrShort(d.cash + d.inKind)} hint={<>Cash-type {inrShort(d.cash)} · in-kind {inrShort(d.inKind)} (reported value, not money received)</>}
          onExplain={() => ask(`Break down confirmed value as of ${asOf} by support type and campaign.`)} />
        <Tile label="Open pipeline" value={inrShort(d.openValue)} hint={<>{d.openCount} open deals at proposed value</>}
          onExplain={() => ask(`What is in the open pipeline as of ${asOf}, and what can realistically close?`)} />
        <Tile label="Stuck deals" value={d.stuck} hint="Open and no stage change for over 14 days. Every 2025 deal that closed did so within 13 days."
          onExplain={() => ask(`Which deals are stuck as of ${asOf} and what should we do about them?`)} />
        <Tile label="Weighted pipeline" value={coverage.data ? inrShort(coverage.data.weighted) : "…"}
          hint={coverage.data ? <>Open value × chance of closing from each stage, learned from history up to this date. {coverage.data.note}</> : "Computing…"}
          onExplain={() => ask(`What is our weighted pipeline as of ${asOf}, and is it enough to hit target?`)} />
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Confirmed partnerships vs target, week by week</h2>
          {weekly.data ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={weekly.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="stepAfter" dataKey="goal" name="Target" stroke="#a3a9b8" strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 2 }} />
                {t && <ReferenceLine y={t.confirmed_partnerships_goal} stroke="transparent" />}
              </LineChart>
            </ResponsiveContainer>
          ) : <Loading />}
          <p className="small muted">The target changes on 15 Mar 2025 when the team moved from the launch plan (20) to the revised plan (28).</p>
        </div>
        <div className="card">
          <h2>Monday signals</h2>
          <table className="t">
            <tbody>
              <Signal name="Confirmations in the last 7 days" value={String(d.newThisWeek)} ok={d.newThisWeek >= 3} rule="Plan needs about 4 a week. Act if below 3 two weeks running." />
              <Signal name="Weighted pipeline ÷ partnerships still needed" value={coverage.data && remaining > 0 ? `${(coverage.data.weightedDeals / remaining).toFixed(1)}×` : remaining === 0 ? "Target met" : "…"}
                ok={remaining === 0 || (coverage.data ? coverage.data.weightedDeals / remaining >= 1.5 : true)} rule="Expected deals from the open pipeline should be at least 1.5× what's left." />
              <Signal name="Stuck deals (14+ days)" value={String(d.stuck)} ok={d.stuck <= 3} rule="Each one gets a task; 21+ days triggers a lost review." />
              <Signal name="Cash paid ÷ confirmed cash-type value" value={d.cash ? `${Math.round((d.paid / d.cash) * 100)}%` : "–"} ok={d.cash === 0 || d.paid / d.cash >= 0.5}
                rule="Our own payments log. The source data has no bank receipts." />
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Confirmed value {inr(d.cash + d.inKind)} as of {day}.</p>
        </div>
      </div>
      <WeekDrivers />
    </>
  );
}

function Signal({ name, value, ok, rule }: { name: string; value: string; ok: boolean; rule: string }) {
  return (
    <tr>
      <td><b>{name}</b><div className="small muted">{rule}</div></td>
      <td className="r" style={{ whiteSpace: "nowrap" }}>{value} <span className={`pill ${ok ? "green" : "red"}`}>{ok ? "OK" : "Act"}</span></td>
    </tr>
  );
}

/** Chance of ending confirmed, by the furthest stage a deal reached, learned from history known on the date. */
async function weightedPipeline(asOf: string) {
  const [snap, hist] = await Promise.all([
    rpc<{ opportunity_id: string; stage: string; proposed_value_inr: number }[]>("opp_snapshot", { d: asOf }),
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
    const c = chance[o.stage];
    if (c == null) continue; // closed deals
    weighted += c * Number(o.proposed_value_inr);
    weightedDeals += c;
  }
  const note = `Negotiating ${Math.round(chance.negotiating * 100)}%, proposal ${Math.round(chance.proposal_sent * 100)}%.`;
  return { weighted, weightedDeals, chance, note };
}
function cutoffIso(d: string) {
  return `${addDays(d, 1)}T00:00:00+05:30`;
}
