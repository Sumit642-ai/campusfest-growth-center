import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { metric, table } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { fmtDate, inr, inrShort } from "../lib/format";
import { ErrorBox, Loading } from "../components/ui";
import CampaignPlan from "../components/CampaignPlan";

type Campaign = { campaign_name: string; channel: string; objective: string; owner_name: string };
const COLS = [
  ["touches", "Touches", "campaign_name"],
  ["brands_touched", "Brands touched", "campaign_name"],
  ["outreach_attempts", "Outreach attempts", "campaign_name"],
  ["replied_brands", "Replied brands", "campaign_name"],
  ["positive_reply_events", "Positive replies", "campaign_name"],
  ["meetings_held_brands", "Meetings (brands)", "campaign_name"],
  ["qualified_brands", "Qualified brands", "source_campaign_name"],
  ["opportunities", "Opportunities", "originating_campaign_name"],
  ["confirmed_partnerships", "Confirmed", "originating_campaign_name"],
  ["confirmed_value", "Confirmed value", "originating_campaign_name"],
] as const;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
const SHORT = new Set(["touches", "brands_touched", "confirmed_partnerships", "confirmed_value"]);
const WARM = new Set(["Warm Partner Introductions", "Creator Network Referrals", "Partner Interest Form"]);

export default function Funnel() {
  const { asOf, version, ask } = useApp();
  const [all, setAll] = useState(false);
  const s = useAsync(async () => {
    const [campaigns, ...cols] = await Promise.all([
      table<Campaign>("src_campaigns"),
      ...COLS.map(([m, , g]) => metric(m, asOf, {}, g)),
    ]);
    const rows = campaigns.map((c) => {
      const v: Record<string, number> = {};
      COLS.forEach(([m], i) => { v[m] = cols[i].find((r) => r.grp === c.campaign_name)?.value ?? 0; });
      return { ...c, v };
    });
    rows.sort((a, b) => b.v.confirmed_value - a.v.confirmed_value || b.v.touches - a.v.touches);
    const total: Record<string, number> = {};
    COLS.forEach(([m]) => { total[m] = rows.reduce((a, r) => a + r.v[m], 0); });
    return { rows, total };
  }, [asOf, version]);

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const { rows, total } = s.data;
  const cols = COLS.filter(([m]) => all || SHORT.has(m));
  const coldTouches = rows.filter((r) => !WARM.has(r.campaign_name)).reduce((a, r) => a + r.v.touches, 0);

  return (
    <>
      <h1>Funnel & Campaigns</h1>
      <p className="sub">What each sponsor campaign produced up to {fmtDate(asOf)}, and next season's campaign plan with owners, dates, budgets and spend.</p>
      <div className="note">Attempts, brands, replies, qualified brands and partnerships are different populations. They can't be divided into one neat funnel, so each column counts its own thing.</div>
      <div className="card scroll">
        <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8 }}><b>2025 campaigns</b><button className="btn" onClick={() => setAll(!all)}>{all ? "Show key columns" : `Show all ${COLS.length + 4} columns`}</button></div>
        <table className="t">
          <thead>
            <tr><th>Campaign</th>{all && <th>Channel</th>}<th className="r">Brand → deal</th><th className="r">Reply rate</th>{all && <th className="r">Meeting rate</th>}{cols.map(([m, l]) => <th key={m} className="r">{l}</th>)}<th className="r">Touches per deal</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dead = r.v.touches >= 50 && r.v.confirmed_partnerships === 0;
              return (
                <tr key={r.campaign_name} className={dead ? "bad" : r.v.confirmed_partnerships > 0 ? "good" : ""}>
                  <td><b>{r.campaign_name}</b><div className="small muted">{WARM.has(r.campaign_name) ? "Warm or inbound" : "Cold"}</div></td>
                  {all && <td>{r.channel}</td>}
                  <td className="r"><b>{pct(r.v.confirmed_partnerships, r.v.brands_touched)}</b></td>
                  <td className="r">{pct(r.v.replied_brands, r.v.brands_touched)}</td>
                  {all && <td className="r">{pct(r.v.meetings_held_brands, r.v.brands_touched)}</td>}
                  {cols.map(([m]) => <td key={m} className="r">{m === "confirmed_value" ? inr(r.v[m]) : r.v[m]}</td>)}
                  <td className="r">{r.v.confirmed_partnerships ? (r.v.touches / r.v.confirmed_partnerships).toFixed(1) : dead ? "no deals" : "–"}</td>
                </tr>
              );
            })}
            <tr>
              <td><b>Total</b></td>{all && <td />}<td colSpan={all ? 3 : 2} className="small muted">rates are per campaign</td>
              {cols.map(([m]) => <td key={m} className="r"><b>{m === "confirmed_value" ? inr(total[m]) : total[m]}</b></td>)}
              <td className="r">{total.confirmed_partnerships ? (total.touches / total.confirmed_partnerships).toFixed(1) : "–"}</td>
            </tr>
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 8 }}>
          Red rows: 50+ touches and no confirmed deal. Cold campaigns took {total.touches ? Math.round((coldTouches / total.touches) * 100) : 0}% of all touches.
          Brands can appear in more than one campaign, so brand columns don't add up to unique brands. Rates divide by brands touched in that campaign (reply rate = replied brands / brands touched; brand → deal = confirmed / brands touched).{" "}
          <button className="explain" style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", padding: 0 }}
            onClick={() => ask(`Which campaigns produce confirmed deals as of ${asOf}, and where is effort wasted?`)}>Ask the Analyst why →</button>
        </p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Confirmed value by campaign</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows.map((r) => ({ name: r.campaign_name, value: r.v.confirmed_value, warm: WARM.has(r.campaign_name) }))} layout="vertical" margin={{ left: 60, right: 30 }}>
            <CartesianGrid stroke="#eef0f3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => inrShort(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => inr(Number(v))} />
            <Bar dataKey="value" name="Confirmed value" radius={[0, 4, 4, 0]}>
              {rows.map((r) => <Cell key={r.campaign_name} fill={WARM.has(r.campaign_name) ? "#4f46e5" : "#c3c7d1"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <CampaignPlan />
    </>
  );
}
