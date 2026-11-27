import type React from "react";
import { useState } from "react";
import { log, rpc, sb, table, type Opp } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { daysBetween, fmtDate, inr, inrShort } from "../lib/format";
import { simulate, type SimOutput } from "../lib/sim";
import { ErrorBox, Loading } from "../components/ui";
import type { Bet } from "./BetsTasks";

type Payment = { id: number; opportunity_id: string; amount_inr: number; due_date: string | null; paid_on: string | null; method: string | null; note: string | null };
type Assumption = { id: number; name: string; value: string; source: string; is_assumption: boolean; confidence: string };

export default function CashScenarios() {
  const { asOf, version, refresh, ask, confirm, toast } = useApp();
  const s = useAsync(async () => {
    const [snap, payments, assumptions, bets] = await Promise.all([
      rpc<Opp[]>("opp_snapshot", { d: asOf }), table<Payment>("payments", "id"), table<Assumption>("assumptions", "id"), table<Bet>("bets", "id"),
    ]);
    return { deals: snap.filter((o) => o.stage === "partner_confirmed" && o.support_type === "cash"), payments, assumptions, bets };
  }, [asOf, version]);
  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const { deals, payments, assumptions, bets } = s.data;

  return (
    <>
      <h1>Cash & Scenarios</h1>
      <p className="sub">Money actually received, what we assume, and what next season could look like.</p>
      <Payments deals={deals} payments={payments} asOf={asOf} onChange={refresh} confirm={confirm} toast={toast} onAsk={() => ask(`How much cash has been collected as of ${asOf}, and which confirmed deals are unpaid?`)} />
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Assumptions</h2>
          <table className="t">
            <thead><tr><th>What</th><th>Value</th><th>Type</th></tr></thead>
            <tbody>{assumptions.map((a) => (
              <tr key={a.id}><td>{a.name}<div className="small muted">{a.source}</div></td><td>{a.value}</td>
                <td><span className={`pill ${a.is_assumption ? "amber" : "green"}`}>{a.is_assumption ? "Assumption" : "From data"}</span><div className="small muted">{a.confidence} confidence</div></td></tr>
            ))}</tbody>
          </table>
        </div>
        <Simulator bets={bets} />
      </div>
    </>
  );
}

type ConfirmFn = (title: string, opts?: { body?: React.ReactNode; ok?: string; danger?: boolean }) => Promise<boolean>;
function Payments({ deals, payments, asOf, onChange, onAsk, confirm, toast }: { deals: Opp[]; payments: Payment[]; asOf: string; onChange: () => void; onAsk: () => void; confirm: ConfirmFn; toast: (t: string, undo?: () => Promise<void>) => void }) {
  const [f, setF] = useState({ opportunity_id: "", amount_inr: "", due_date: "", paid_on: "", method: "UPI" });
  const [err, setErr] = useState("");
  const paidBy = (id: string) => payments.filter((p) => p.opportunity_id === id && p.paid_on && p.paid_on <= asOf).reduce((a, p) => a + Number(p.amount_inr), 0);
  const confirmedCash = deals.reduce((a, d) => a + Number(d.confirmed_value_inr), 0);
  const received = deals.reduce((a, d) => a + paidBy(d.opportunity_id), 0);

  async function add() {
    if (!f.opportunity_id || !f.amount_inr) return setErr("Pick a deal and an amount.");
    if (Number(f.amount_inr) <= 0) return setErr("The amount must be above ₹0.");
    if (f.paid_on && f.paid_on > asOf) return setErr(`A payment can't be marked paid after the as-of date (${fmtDate(asOf)}). Leave Paid empty and set a Due date instead.`);
    const row = { opportunity_id: f.opportunity_id, amount_inr: Number(f.amount_inr), due_date: f.due_date || null, paid_on: f.paid_on || null, method: f.method, note: "app" };
    const { error } = await sb.from("payments").insert(row);
    if (error) return setErr(error.message);
    await log("payment_add", row); setErr(""); setF({ ...f, opportunity_id: "", amount_inr: "", due_date: "", paid_on: "" }); onChange();
  }
  async function markPaid(p: Payment) {
    const { error } = await sb.from("payments").update({ paid_on: asOf }).eq("id", p.id);
    if (error) return setErr(error.message);
    await log("payment_paid", { id: p.id }); onChange();
  }
  async function remove(p: Payment, brand: string) {
    const ok = await confirm("Delete this payment?", { ok: "Delete payment", danger: true,
      body: <p>{inr(Number(p.amount_inr))} from {brand} ({p.paid_on ? `paid ${fmtDate(p.paid_on)}` : p.due_date ? `due ${fmtDate(p.due_date)}` : "no date"}) will be removed from the payments log.</p> });
    if (!ok) return;
    const { error } = await sb.from("payments").delete().eq("id", p.id);
    if (error) return setErr(error.message);
    await log("payment_delete", { id: p.id }); onChange();
    toast("Payment deleted.", async () => { const { id: _drop, ...row } = p; await sb.from("payments").insert(row); await log("payment_restore", row); onChange(); });
  }

  return (
    <div className="card">
      <div className="inline" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Payments log</h2>
        <button className="btn sm" onClick={onAsk}>Ask about cash →</button>
      </div>
      <div className="note" style={{ marginTop: 10 }}>Source data reports partnership value, not bank receipts. This log is our own record, so the cash figure is only as good as what the team enters here.</div>
      <p className="small muted" style={{ margin: "0 0 6px" }}>Only payments dated on or before {fmtDate(asOf)} count as paid. Later ones show as scheduled.</p>
      <p><b>{inrShort(received)}</b> received of <b>{inrShort(confirmedCash)}</b> confirmed cash-type value across {deals.length} deals, as of {fmtDate(asOf)}.</p>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Deal</th><th className="r">Confirmed</th><th className="r">Paid by date</th><th>Payments</th></tr></thead>
          <tbody>
            {deals.map((d) => {
              const ps = payments.filter((p) => p.opportunity_id === d.opportunity_id);
              return (
                <tr key={d.opportunity_id}>
                  <td><b>{d.brand_name}</b> <span className="small muted">{d.opportunity_id}</span></td>
                  <td className="r">{inr(Number(d.confirmed_value_inr))}</td>
                  <td className="r">{inr(paidBy(d.opportunity_id))}</td>
                  <td>{ps.length === 0 ? <span className="small muted">Nothing logged</span> : ps.map((p) => {
                    // A payment dated after the as-of date had not happened yet on that date: show it as scheduled, never as paid.
                    const paidNow = !!p.paid_on && p.paid_on <= asOf;
                    const due = p.due_date ?? (paidNow ? null : p.paid_on);
                    const overdue = !paidNow && due && due < asOf ? daysBetween(due, asOf) : 0;
                    return (
                      <div key={p.id} className={`pay small ${paidNow ? "" : "scheduled"}`}>
                        <span>{inr(Number(p.amount_inr))} · {paidNow ? <span className="pill green">paid {fmtDate(p.paid_on!)}</span> : due ? <span className="pill grey">scheduled · due {fmtDate(due)}</span> : <span className="pill grey">no date</span>}
                          {p.method && ` · ${p.method}`} {overdue > 0 && <span className="pill red">{overdue}d overdue</span>}
                          {p.note?.startsWith("demo seed") && <span className="muted"> · demo</span>}</span>
                        <span className="pay-actions">
                          {!paidNow && <button className="btn sm" onClick={() => markPaid(p)}>Mark paid on {fmtDate(asOf)}</button>}
                          <button className="btn sm danger" aria-label={`Delete payment of ${inr(Number(p.amount_inr))}`} onClick={() => remove(p, d.brand_name)}>Delete</button>
                        </span>
                      </div>
                    );
                  })}</td>
                </tr>
              );
            })}
            {deals.length === 0 && <tr><td colSpan={4} className="muted">No confirmed cash deals on this date.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="inline" style={{ marginTop: 10 }}>
        <select value={f.opportunity_id} onChange={(e) => setF({ ...f, opportunity_id: e.target.value })}>
          <option value="">Deal…</option>{deals.map((d) => <option key={d.opportunity_id} value={d.opportunity_id}>{d.brand_name} ({d.opportunity_id})</option>)}
        </select>
        <input type="number" min={1} placeholder="Amount ₹" value={f.amount_inr} onChange={(e) => setF({ ...f, amount_inr: e.target.value })} style={{ width: 110 }} />
        <label className="small muted">Due <input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></label>
        <label className="small muted">Paid <input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} /></label>
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>UPI</option><option>Bank transfer</option><option>Cheque</option></select>
        <button className="btn primary" disabled={!f.opportunity_id || !(Number(f.amount_inr) > 0)} onClick={add}>Add payment</button>
      </div>
    </div>
  );
}

const SIM_DEFAULTS = { renewalRate: 0.5, warmBrands: 30, warmClose: 0.55, avgDeal: 93333, collection: 0.87 };
function Simulator({ bets }: { bets: Bet[] }) {
  const [p, setP] = useState(SIM_DEFAULTS);
  const [on, setOn] = useState<boolean[]>(bets.map(() => true));
  const [out, setOut] = useState<SimOutput | null>(null);
  const [stale, setStale] = useState(false);
  const run = () => { setOut(simulate({ ...p, bets: bets.map((b, i) => ({ on: on[i], chance: Number(b.chance) })) })); setStale(false); };
  const reset = () => { setP(SIM_DEFAULTS); setOn(bets.map(() => true)); if (out) setStale(true); };
  const S = (k: keyof typeof p, label: string, min: number, max: number, step: number, show: (v: number) => string) => (
    <div className="slider"><span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={p[k]} onChange={(e) => { setP({ ...p, [k]: Number(e.target.value) }); if (out) setStale(true); }} /><b className="num">{show(p[k])}</b></div>
  );
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="card">
      <h2>Next season simulator</h2>
      <p className="small muted">5,000 simulated seasons. Defaults are the plan's base case. Cold outreach is set to zero because it closed 0 of 33 deals in 2025.</p>
      <div className="grid" style={{ gap: 8 }}>
        {S("renewalRate", "Past partners who renew", 0, 1, 0.05, pc)}
        {S("warmBrands", "New warm brands", 0, 80, 1, String)}
        {S("warmClose", "Warm close rate", 0, 1, 0.01, pc)}
        {S("avgDeal", "Average deal", 20000, 200000, 1000, (v) => inr(v))}
        {S("collection", "Cash collected before fest", 0, 1, 0.01, pc)}
      </div>
      <div style={{ margin: "12px 0" }}>
        {bets.map((b, i) => (
          <label key={b.id} className="small" style={{ display: "block", marginBottom: 4 }}>
            <input type="checkbox" checked={on[i] ?? true} onChange={(e) => { setOn(on.map((x, j) => (j === i ? e.target.checked : x))); if (out) setStale(true); }} /> Bet {i + 1}: {b.name} <span className="muted">({pc(Number(b.chance))} chance it works)</span>
          </label>
        ))}
      </div>
      <div className="inline">
        <button className="btn primary" onClick={run}>{stale ? "Re-run with new settings" : "Run 5,000 seasons"}</button>
        <button className="btn" onClick={reset}>Reset to plan defaults</button>
      </div>
      {out && stale && <div className="note" style={{ marginTop: 10, marginBottom: 0 }}>Settings changed. These results are out of date: click <b>Re-run</b>.</div>}
      {out && (
        <table className={`t ${stale ? "stale" : ""}`} style={{ marginTop: 12 }}>
          <thead><tr><th /><th className="r">P10 (bad year)</th><th className="r">P50 (likely)</th><th className="r">P90 (good year)</th></tr></thead>
          <tbody>
            <tr><td>Confirmed value</td>{out.value.map((v, i) => <td key={i} className="r">{inrShort(v)}</td>)}</tr>
            <tr><td>Cash before fest</td>{out.cash.map((v, i) => <td key={i} className="r">{inrShort(v)}</td>)}</tr>
            <tr><td colSpan={4} className="small muted">Chance of beating 2025's ₹22.4L: <b>{pc(out.pAbove(2240000))}</b> · chance of ₹40L or more: <b>{pc(out.pAbove(4000000))}</b></td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
