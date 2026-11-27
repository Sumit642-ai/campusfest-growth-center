import { rpc, Opp, OPEN } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { addDays, fmtDate, inrShort, STAGE_LABEL } from "../lib/format";
import { ErrorBox, Loading } from "./ui";

type Qual = { brand_id: string; brand_name: string; qualification_status: string; source_campaign_name: string };
const RANK: Record<string, number> = { prospecting: 0, contacted: 1, proposal_sent: 2, negotiating: 3, partner_confirmed: 4 };

/** What changed in the last 7 days and which campaigns drove it: compares the snapshot on the date with the one 7 days before. */
export default function WeekDrivers() {
  const { asOf, version, ask } = useApp();
  const prev = addDays(asOf, -7);
  const s = useAsync(async () => {
    const [now, before, qNow, qBefore] = await Promise.all([
      rpc<Opp[]>("opp_snapshot", { d: asOf }),
      rpc<Opp[]>("opp_snapshot", { d: prev }),
      rpc<Qual[]>("qual_snapshot", { d: asOf }),
      rpc<Qual[]>("qual_snapshot", { d: prev }),
    ]);
    const old = new Map(before.map((o) => [o.opportunity_id, o]));
    const confirmed: Opp[] = [], advanced: Opp[] = [], lost: Opp[] = [], added: Opp[] = [];
    for (const o of now) {
      const p = old.get(o.opportunity_id);
      if (!p) { added.push(o); if (o.stage === "partner_confirmed") confirmed.push(o); continue; }
      if (p.stage === o.stage) continue;
      if (o.stage === "partner_confirmed") confirmed.push(o);
      else if (!OPEN(o.stage)) lost.push(o);
      else if ((RANK[o.stage] ?? 0) > (RANK[p.stage] ?? 0)) advanced.push(o);
    }
    const wasQ = new Set(qBefore.filter((q) => q.qualification_status === "qualified").map((q) => q.brand_id));
    const newQ = qNow.filter((q) => q.qualification_status === "qualified" && !wasQ.has(q.brand_id));
    // Campaign driver table: confirmations, value and new qualified brands per campaign this week.
    const by = new Map<string, { deals: number; value: number; qualified: number; moved: number }>();
    const row = (c: string) => { const k = c || "Unknown"; if (!by.has(k)) by.set(k, { deals: 0, value: 0, qualified: 0, moved: 0 }); return by.get(k)!; };
    confirmed.forEach((o) => { const r = row(o.originating_campaign_name); r.deals++; r.value += Number(o.confirmed_value_inr || o.proposed_value_inr || 0); });
    advanced.forEach((o) => { row(o.originating_campaign_name).moved++; });
    newQ.forEach((q) => { row(q.source_campaign_name).qualified++; });
    const drivers = [...by].map(([campaign, r]) => ({ campaign, ...r })).sort((a, b) => b.value - a.value || b.deals - a.deals || b.moved - a.moved || b.qualified - a.qualified);
    const pipeNow = now.filter((o) => OPEN(o.stage)).reduce((a, o) => a + Number(o.proposed_value_inr || 0), 0);
    const pipeBefore = before.filter((o) => OPEN(o.stage)).reduce((a, o) => a + Number(o.proposed_value_inr || 0), 0);
    return { confirmed, advanced, lost, added, newQ, drivers, pipeDelta: pipeNow - pipeBefore };
  }, [asOf, version]);

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <div className="card"><h2>What changed this week, and why</h2><Loading /></div>;
  const d = s.data;
  const value = d.confirmed.reduce((a, o) => a + Number(o.confirmed_value_inr || o.proposed_value_inr || 0), 0);
  const quiet = !d.confirmed.length && !d.advanced.length && !d.lost.length && !d.newQ.length && !d.added.length;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h2>What changed this week, and why <span className="muted small">· {fmtDate(prev)} → {fmtDate(asOf)}</span></h2>
      <div className="grid g4" style={{ marginBottom: 10 }}>
        <Delta label="New partnerships" v={d.confirmed.length} hint={value ? `${inrShort(value)} confirmed` : "none this week"} />
        <Delta label="Deals moved forward" v={d.advanced.length} hint={`${d.added.length} new deals opened`} />
        <Delta label="Newly qualified brands" v={d.newQ.length} hint="qualification changed to qualified" />
        <Delta label="Open pipeline change" v={d.pipeDelta} money hint={`${d.lost.length} deals lost or withdrawn`} />
      </div>
      {quiet ? <p className="muted">Nothing moved in these 7 days. Pick a later date in the top bar, or ask the analyst why the week was quiet.</p> : (
        <table className="t">
          <thead><tr><th>Driver (campaign)</th><th className="r">Signed</th><th className="r">Value signed</th><th className="r">Moved a stage</th><th className="r">Newly qualified</th></tr></thead>
          <tbody>
            {d.drivers.slice(0, 6).map((r) => (
              <tr key={r.campaign}><td><b>{r.campaign}</b></td><td className="r">{r.deals || "–"}</td><td className="r">{r.value ? inrShort(r.value) : "–"}</td><td className="r">{r.moved || "–"}</td><td className="r">{r.qualified || "–"}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {d.confirmed.length > 0 && (
        <p className="small" style={{ marginTop: 8 }}><b>Signed:</b> {d.confirmed.map((o) => `${o.brand_name} (${inrShort(Number(o.confirmed_value_inr || o.proposed_value_inr || 0))})`).join(", ")}</p>
      )}
      {d.advanced.length > 0 && (
        <p className="small muted"><b>Moved:</b> {d.advanced.slice(0, 6).map((o) => `${o.brand_name} → ${STAGE_LABEL[o.stage] ?? o.stage}`).join(", ")}{d.advanced.length > 6 ? ` and ${d.advanced.length - 6} more` : ""}</p>
      )}
      <button className="explain" onClick={() => ask(`What changed between ${prev} and ${asOf}, which campaigns drove it, and what should we do next week?`)}>Ask the analyst to explain this week →</button>
    </div>
  );
}

function Delta({ label, v, hint, money }: { label: string; v: number; hint: string; money?: boolean }) {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const txt = money ? `${sign}${inrShort(Math.abs(v))}` : `${sign}${Math.abs(v)}`;
  return (
    <div>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: v > 0 ? "#12945a" : v < 0 ? "#d14343" : undefined }}>{txt}</div>
      <div className="small muted">{hint}</div>
    </div>
  );
}
