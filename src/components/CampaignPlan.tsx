import type React from "react";
import { useState } from "react";
import { log, sb, table } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { fmtDate, inr, inrShort } from "../lib/format";
import { ErrorBox, Loading } from "./ui";

export type PlanRow = {
  id: number; name: string; kind: string | null; owner: string | null; status: string; start_date: string | null; end_date: string | null;
  bet_id: number | null; budget_inr: number; spent_inr: number; remaining_inr: number; pct_spent: number | null;
  target_deals: number; target_value_inr: number; planned_cost_per_deal: number | null;
};
type Plan = { id: number; channel: string | null; based_on: string | null; note: string | null; created_by: string };
type Spend = { id: number; campaign_id: number; amount_inr: number; spent_on: string | null; note: string | null };

const STATUSES = ["planned", "active", "paused", "stopped", "done"];
const KINDS = ["warm", "inbound", "renewal", "revival", "partner", "cold"];
const blank = { name: "", kind: "warm", owner: "", start_date: "", end_date: "", budget_inr: "", target_deals: "", target_value_inr: "", bet_id: "" };

/** Next season's campaign plan: add, edit, pause or stop campaigns, set owners, dates and budgets, and log spend. */
export default function CampaignPlan() {
  const { version, refresh, ask, confirm, toast } = useApp();
  const [editing, setEditing] = useState<number | null>(null);
  const [spendFor, setSpendFor] = useState<number | null>(null);
  const [draft, setDraft] = useState(blank);
  const [err, setErr] = useState("");
  const [touched, setTouched] = useState(false);
  const s = useAsync(async () => {
    const [rows, plan, spend, bets] = await Promise.all([
      table<PlanRow>("v_campaign_budget", "id"), table<Plan>("campaign_plan", "id"), table<Spend>("campaign_spend", "id"), table<{ id: number; name: string }>("bets", "id"),
    ]);
    return { rows, plan, spend, bets };
  }, [version]);
  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const { rows, plan, spend, bets } = s.data;

  async function run(p: PromiseLike<{ error: { message: string } | null }>, action: string, detail: Record<string, unknown>) {
    const { error } = await p;
    if (error) return setErr(error.message);
    await log(action, detail); setErr(""); refresh();
  }
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const fieldErr = validate(draft);
  const formOk = Object.keys(fieldErr).length === 0;
  async function add() {
    if (!formOk) return;
    const row = { name: draft.name.trim(), kind: draft.kind, owner: draft.owner || null, start_date: draft.start_date || null, end_date: draft.end_date || null,
      budget_inr: num(draft.budget_inr), target_deals: num(draft.target_deals), target_value_inr: num(draft.target_value_inr), bet_id: draft.bet_id ? Number(draft.bet_id) : null, status: "planned", created_by: "human" };
    await run(sb.from("campaign_plan").insert(row), "campaign_create", row);
    setDraft(blank); setTouched(false); toast(`Campaign “${row.name}” added.`);
  }
  async function remove(r: PlanRow) {
    const spends = spend.filter((x) => x.campaign_id === r.id);
    const ok = await confirm(`Delete “${r.name}”?`, { ok: "Delete campaign", danger: true,
      body: <p>This removes the campaign{spends.length ? ` and its ${spends.length} spend ${spends.length === 1 ? "entry" : "entries"} (${inr(Number(r.spent_inr))})` : ""} from next season's plan. To keep it but stop work, set its status to <b>stopped</b> instead.</p> });
    if (!ok) return;
    const p = plan.find((x) => x.id === r.id);
    const { data: full } = await sb.from("campaign_plan").select("*").eq("id", r.id).single();
    await run(sb.from("campaign_plan").delete().eq("id", r.id), "campaign_delete", { id: r.id, name: r.name });
    toast(`Campaign “${r.name}” deleted.`, full ? async () => {
      const { error } = await sb.from("campaign_plan").insert(full);
      if (error) return toast(`Couldn't undo: ${error.message}`, undefined, "err");
      if (spends.length) await sb.from("campaign_spend").insert(spends.map(({ id: _i, ...x }) => x));
      await log("campaign_restore", { id: r.id, name: r.name, based_on: p?.based_on }); refresh(); toast("Campaign restored.");
    } : undefined);
  }

  const live = rows.filter((r) => r.status !== "stopped");
  const tot = {
    budget: live.reduce((a, r) => a + Number(r.budget_inr), 0), spent: rows.reduce((a, r) => a + Number(r.spent_inr), 0),
    deals: live.reduce((a, r) => a + Number(r.target_deals), 0), value: live.reduce((a, r) => a + Number(r.target_value_inr), 0),
  };
  const over = rows.filter((r) => Number(r.spent_inr) > Number(r.budget_inr));

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>Next season's campaign plan</h2>
        <button className="btn sm" onClick={() => ask("Look at next season's campaign plan: which campaigns are over budget or behind, and where should we move budget? Use the campaign plan and spend data.")}>Ask the Analyst about budgets →</button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        The team's own plan, built from the 2025 findings above. Edit owners, dates, budgets and status, and log spend; the totals and the analyst update straight away.
        2025 campaigns above stay read-only. Spend is app data (the 2025 source has none).
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 10 }}>
        <div className="card tile"><div className="label">Planned budget (not stopped)</div><div className="value">{inrShort(tot.budget)}</div>
          <div className="bar"><i style={{ width: `${tot.budget ? Math.min(100, (tot.spent / tot.budget) * 100) : 0}%` }} /></div><div className="hint">{inr(tot.spent)} spent · {inr(tot.budget - tot.spent)} left</div></div>
        <div className="card tile"><div className="label">Planned deals</div><div className="value">{tot.deals}</div><div className="hint">slide 1 target: 38 partners (P50)</div></div>
        <div className="card tile"><div className="label">Planned value</div><div className="value">{inrShort(tot.value)}</div><div className="hint">= ₹26.6L base + ₹13.8L from bets ≈ ₹41L target. Plan, not results</div></div>
        <div className="card tile"><div className="label">Over budget</div><div className="value" style={{ color: over.length ? "var(--red)" : undefined }}>{over.length}</div><div className="hint">{over.length ? over.map((o) => o.name).join(", ") : "none"}</div></div>
      </div>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Campaign</th><th>Owner</th><th>Dates</th><th>Status</th><th className="r">Budget</th><th>Spent</th><th className="r">Target deals</th><th className="r">Target value</th><th className="r">Cost per deal</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = plan.find((x) => x.id === r.id);
              const spent = Number(r.spent_inr), deals = Number(r.target_deals);
              if (editing === r.id) return <EditPlan key={r.id} r={r} onCancel={() => setEditing(null)} onSave={(c) => { setEditing(null); run(sb.from("campaign_plan").update({ ...c, updated_at: new Date().toISOString() }).eq("id", r.id), "campaign_edit", { id: r.id, ...c }); }} />;
              const pct = Number(r.budget_inr) ? Math.min(100, (Number(r.spent_inr) / Number(r.budget_inr)) * 100) : 0;
              const isOver = Number(r.spent_inr) > Number(r.budget_inr);
              return (
                <tr key={r.id} className={r.status === "stopped" ? "bad" : ""}>
                  <td><b>{r.name}</b> <span className="pill grey">{r.kind}</span>{r.bet_id ? <> <span className="pill blue">Bet {r.bet_id}</span></> : null}
                    {p?.based_on && <div className="small muted">Based on: {p.based_on}</div>}{p?.note && <div className="small muted">{p.note}</div>}</td>
                  <td>{r.owner}</td>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{r.start_date ? fmtDate(r.start_date) : "–"}<br />{r.end_date ? `to ${fmtDate(r.end_date)}` : ""}</td>
                  <td>
                    <select className={`status-pill s-${r.status}`} aria-label={`Status of ${r.name}`} value={r.status} onChange={(e) => run(sb.from("campaign_plan").update({ status: e.target.value, updated_at: new Date().toISOString() }).eq("id", r.id), "campaign_status", { id: r.id, status: e.target.value })}>
                      {STATUSES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="r">{inr(Number(r.budget_inr))}</td>
                  <td style={{ minWidth: 130 }}>
                    <span style={{ color: isOver ? "var(--red)" : undefined }}>{inr(Number(r.spent_inr))}</span>{r.pct_spent != null && <span className="small muted"> · {r.pct_spent}%</span>}
                    {Number(r.budget_inr) > 0 && <div className="bar"><i style={{ width: `${pct}%`, background: isOver ? "var(--red)" : undefined }} /></div>}
                    {spend.filter((x) => x.campaign_id === r.id).slice(-2).map((x) => <div key={x.id} className="small muted">{inr(Number(x.amount_inr))}{x.spent_on ? ` on ${fmtDate(x.spent_on)}` : ""}{x.note ? ` · ${x.note}` : ""}</div>)}
                  </td>
                  <td className="r">{Number(r.target_deals) === 0 && Number(r.target_value_inr) > 0 ? <>0<div className="small muted">premium on existing deals</div></> : Number(r.target_deals)}</td>
                  <td className="r">{inrShort(Number(r.target_value_inr))}</td>
                  <td className="r">{spent > 0 && deals > 0 ? <>{inr(spent / deals)}<div className="small muted">actual spend ÷ target deals</div></>
                    : r.planned_cost_per_deal ? <>{inr(Number(r.planned_cost_per_deal))}<div className="small muted">planned</div></> : "–"}</td>
                  <td style={{ whiteSpace: "nowrap", position: "relative" }}>
                    <button className="btn sm" onClick={() => setEditing(r.id)}>Edit</button>{" "}
                    <button className="btn sm" onClick={() => setSpendFor(spendFor === r.id ? null : r.id)}>+ Spend</button>{" "}
                    <button className="btn sm danger" onClick={() => remove(r)}>Delete</button>
                    {spendFor === r.id && <AddSpend r={r} onCancel={() => setSpendFor(null)} onDone={() => { setSpendFor(null); refresh(); toast(`Spend logged on ${r.name}.`); }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontSize: 13, margin: "14px 0 6px" }}>Add a campaign</h3>
      <div className="addform" onBlur={() => setTouched(true)}>
        <F label="Name *" err={touched ? fieldErr.name : undefined}><input placeholder="e.g. Alumni founders intro" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></F>
        <F label="Kind"><select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></F>
        <F label="Owner *" err={touched ? fieldErr.owner : undefined}><input placeholder="e.g. Nisha Rao" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></F>
        <F label="Start *" err={touched ? fieldErr.start_date : undefined}><input type="date" min="2027-01-01" max="2027-04-09" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></F>
        <F label="End *" err={touched ? fieldErr.end_date : undefined}><input type="date" min={draft.start_date || "2027-01-01"} max="2027-04-09" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></F>
        <F label="Budget ₹" err={touched ? fieldErr.budget_inr : undefined}><input type="number" min={0} placeholder="0" value={draft.budget_inr} onChange={(e) => setDraft({ ...draft, budget_inr: e.target.value })} /></F>
        <F label="Target deals" err={touched ? fieldErr.target_deals : undefined}><input type="number" min={0} placeholder="0" value={draft.target_deals} onChange={(e) => setDraft({ ...draft, target_deals: e.target.value })} /></F>
        <F label="Target value ₹" err={touched ? fieldErr.target_value_inr : undefined}><input type="number" min={0} placeholder="0" value={draft.target_value_inr} onChange={(e) => setDraft({ ...draft, target_value_inr: e.target.value })} /></F>
        <F label="Bet"><select value={draft.bet_id} onChange={(e) => setDraft({ ...draft, bet_id: e.target.value })}><option value="">No bet</option>{bets.map((b) => <option key={b.id} value={b.id}>Bet {b.id}</option>)}</select></F>
        <div className="f"><span>&nbsp;</span><button className="btn primary" disabled={!formOk} title={formOk ? "" : "Fill the fields marked * and fix any errors"} onClick={add}>Add campaign</button></div>
      </div>
      {!formOk && touched && <div className="small muted" style={{ marginTop: 4 }}>Fix the highlighted fields to enable “Add campaign”. Next season's campaigns run between 1 Jan and 9 Apr 2027.</div>}
    </div>
  );
}

function EditPlan({ r, onSave, onCancel }: { r: PlanRow; onSave: (c: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: r.name, owner: r.owner ?? "", start_date: r.start_date ?? "", end_date: r.end_date ?? "", budget_inr: String(r.budget_inr), target_deals: String(r.target_deals), target_value_inr: String(r.target_value_inr) });
  const [err, setErr] = useState("");
  function save() {
    if (!v.name.trim()) return setErr("Name needed");
    if (v.start_date && v.end_date && v.end_date < v.start_date) return setErr("End is before start");
    if ([v.budget_inr, v.target_deals, v.target_value_inr].some((x) => Number(x) < 0)) return setErr("Numbers can't be negative");
    onSave({ name: v.name.trim(), owner: v.owner || null, start_date: v.start_date || null, end_date: v.end_date || null,
      budget_inr: Number(v.budget_inr || 0), target_deals: Number(v.target_deals || 0), target_value_inr: Number(v.target_value_inr || 0) });
  }
  return (
    <tr>
      <td><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} style={{ width: "100%" }} />{err && <div className="small" style={{ color: "var(--red)" }}>{err}</div>}</td>
      <td><input value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })} style={{ width: 100 }} /></td>
      <td><input type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /><input type="date" value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></td>
      <td />
      <td><input type="number" value={v.budget_inr} onChange={(e) => setV({ ...v, budget_inr: e.target.value })} style={{ width: 90 }} /></td>
      <td />
      <td><input type="number" value={v.target_deals} onChange={(e) => setV({ ...v, target_deals: e.target.value })} style={{ width: 60 }} /></td>
      <td><input type="number" value={v.target_value_inr} onChange={(e) => setV({ ...v, target_value_inr: e.target.value })} style={{ width: 100 }} /></td>
      <td />
      <td style={{ whiteSpace: "nowrap" }}><button className="btn sm primary" onClick={save}>Save</button> <button className="btn sm" onClick={onCancel}>Cancel</button></td>
    </tr>
  );
}

/** Spend entry opens in a pop-over, so the table row keeps its layout. The date defaults to the campaign's own start date. */
function AddSpend({ r, onDone, onCancel }: { r: PlanRow; onDone: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(""); const [on, setOn] = useState(r.start_date ?? ""); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  async function save() {
    if (!amount || Number(amount) <= 0) return setErr("Enter an amount above 0.");
    if (r.start_date && on && on < r.start_date) return setErr("Date is before the campaign starts.");
    if (r.end_date && on && on > r.end_date) return setErr("Date is after the campaign ends.");
    const row = { campaign_id: r.id, amount_inr: Number(amount), spent_on: on || null, note: note || null, created_by: "human" };
    const { error } = await sb.from("campaign_spend").insert(row);
    if (error) return setErr(error.message);
    await log("campaign_spend", row); onDone();
  }
  return (
    <div className="popover" role="dialog" aria-label={`Log spend on ${r.name}`}>
      <b className="small">Log spend · {r.name}</b>
      <div className="form" style={{ marginTop: 6 }}>
        <input type="number" min={1} placeholder="Amount ₹" value={amount} autoFocus onChange={(e) => setAmount(e.target.value)} />
        <input type="date" aria-label="Spend date" value={on} min={r.start_date ?? undefined} max={r.end_date ?? undefined} onChange={(e) => setOn(e.target.value)} />
        <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {err && <div className="small" style={{ color: "var(--red)", marginTop: 4, whiteSpace: "normal" }}>{err}</div>}
      <div className="inline" style={{ marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn sm" onClick={onCancel}>Cancel</button>
        <button className="btn sm primary" disabled={!(Number(amount) > 0)} onClick={save}>Save</button>
      </div>
    </div>
  );
}

type Draft = typeof blank;
function validate(d: Draft) {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) e.name = "Required";
  if (!d.owner.trim()) e.owner = "Required";
  if (!d.start_date) e.start_date = "Required";
  if (!d.end_date) e.end_date = "Required";
  if (d.start_date && d.end_date && d.end_date < d.start_date) e.end_date = "Must be on or after the start";
  if (d.start_date && (d.start_date < "2027-01-01" || d.start_date > "2027-04-09")) e.start_date = "Next season: 1 Jan–9 Apr 2027";
  if (d.end_date && !e.end_date && (d.end_date < "2027-01-01" || d.end_date > "2027-04-09")) e.end_date = "Next season: 1 Jan–9 Apr 2027";
  for (const k of ["budget_inr", "target_deals", "target_value_inr"] as const) if (d[k] !== "" && (Number(d[k]) < 0 || Number.isNaN(Number(d[k])))) e[k] = "Can't be negative";
  return e;
}
function F({ label, err, children }: { label: string; err?: string; children: React.ReactNode }) {
  return <label className={`f ${err ? "bad" : ""}`}><span>{label}</span>{children}{err && <em>{err}</em>}</label>;
}
