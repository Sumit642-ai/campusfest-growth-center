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
  const { version, refresh, ask, clock } = useApp();
  const [editing, setEditing] = useState<number | null>(null);
  const [spendFor, setSpendFor] = useState<number | null>(null);
  const [draft, setDraft] = useState(blank);
  const [err, setErr] = useState("");
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
  async function add() {
    if (!draft.name.trim()) return setErr("A campaign needs a name.");
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) return setErr("The end date is before the start date.");
    const row = { name: draft.name.trim(), kind: draft.kind, owner: draft.owner || null, start_date: draft.start_date || null, end_date: draft.end_date || null,
      budget_inr: num(draft.budget_inr), target_deals: num(draft.target_deals), target_value_inr: num(draft.target_value_inr), bet_id: draft.bet_id ? Number(draft.bet_id) : null, status: "planned", created_by: "human" };
    await run(sb.from("campaign_plan").insert(row), "campaign_create", row);
    setDraft(blank);
  }

  const live = rows.filter((r) => r.status !== "stopped");
  const tot = {
    budget: live.reduce((a, r) => a + Number(r.budget_inr), 0), spent: rows.reduce((a, r) => a + Number(r.spent_inr), 0),
    deals: live.reduce((a, r) => a + Number(r.target_deals), 0), value: live.reduce((a, r) => a + Number(r.target_value_inr), 0),
  };
  const over = rows.filter((r) => Number(r.spent_inr) > Number(r.budget_inr));
  const betNo = (id: number | null) => (id ? bets.findIndex((b) => b.id === id) + 1 : 0);

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
        <div className="card tile"><div className="label">Budget (live campaigns)</div><div className="value">{inrShort(tot.budget)}</div>
          <div className="bar"><i style={{ width: `${tot.budget ? Math.min(100, (tot.spent / tot.budget) * 100) : 0}%` }} /></div><div className="hint">{inr(tot.spent)} spent · {inr(tot.budget - tot.spent)} left</div></div>
        <div className="card tile"><div className="label">Planned deals</div><div className="value">{tot.deals}</div><div className="hint">target on slide 1: 38 at P50</div></div>
        <div className="card tile"><div className="label">Planned value</div><div className="value">{inrShort(tot.value)}</div><div className="hint">plan, not results · slide target ₹41L (P50)</div></div>
        <div className="card tile"><div className="label">Over budget</div><div className="value" style={{ color: over.length ? "var(--red)" : undefined }}>{over.length}</div><div className="hint">{over.length ? over.map((o) => o.name).join(", ") : "none"}</div></div>
      </div>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Campaign</th><th>Owner</th><th>Dates</th><th>Status</th><th className="r">Budget</th><th>Spent</th><th className="r">Target deals</th><th className="r">Target value</th><th className="r">Cost per deal</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const p = plan.find((x) => x.id === r.id);
              if (editing === r.id) return <EditPlan key={r.id} r={r} onCancel={() => setEditing(null)} onSave={(c) => { setEditing(null); run(sb.from("campaign_plan").update({ ...c, updated_at: new Date().toISOString() }).eq("id", r.id), "campaign_edit", { id: r.id, ...c }); }} />;
              const pct = Number(r.budget_inr) ? Math.min(100, (Number(r.spent_inr) / Number(r.budget_inr)) * 100) : 0;
              const isOver = Number(r.spent_inr) > Number(r.budget_inr);
              return (
                <tr key={r.id} className={r.status === "stopped" ? "bad" : ""}>
                  <td><b>{r.name}</b> <span className="pill grey">{r.kind}</span>{r.bet_id ? <> <span className="pill blue">Bet {betNo(r.bet_id)}</span></> : null}
                    {p?.based_on && <div className="small muted">Based on: {p.based_on}</div>}{p?.note && <div className="small muted">{p.note}</div>}</td>
                  <td>{r.owner}</td>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{r.start_date ? fmtDate(r.start_date) : "–"}<br />{r.end_date ? `to ${fmtDate(r.end_date)}` : ""}</td>
                  <td>
                    <select value={r.status} onChange={(e) => run(sb.from("campaign_plan").update({ status: e.target.value, updated_at: new Date().toISOString() }).eq("id", r.id), "campaign_status", { id: r.id, status: e.target.value })}>
                      {STATUSES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="r">{inr(Number(r.budget_inr))}</td>
                  <td style={{ minWidth: 130 }}>
                    <span style={{ color: isOver ? "var(--red)" : undefined }}>{inr(Number(r.spent_inr))}</span>{r.pct_spent != null && <span className="small muted"> · {r.pct_spent}%</span>}
                    {Number(r.budget_inr) > 0 && <div className="bar"><i style={{ width: `${pct}%`, background: isOver ? "var(--red)" : undefined }} /></div>}
                    {spend.filter((x) => x.campaign_id === r.id).slice(-2).map((x) => <div key={x.id} className="small muted">{inr(Number(x.amount_inr))}{x.spent_on ? ` on ${fmtDate(x.spent_on)}` : ""}{x.note ? ` · ${x.note}` : ""}</div>)}
                  </td>
                  <td className="r">{Number(r.target_deals)}</td>
                  <td className="r">{inrShort(Number(r.target_value_inr))}</td>
                  <td className="r">{r.planned_cost_per_deal ? inr(Number(r.planned_cost_per_deal)) : "–"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn sm" onClick={() => setEditing(r.id)}>Edit</button>{" "}
                    <button className="btn sm" onClick={() => setSpendFor(spendFor === r.id ? null : r.id)}>+ Spend</button>{" "}
                    <button className="btn sm danger" onClick={() => run(sb.from("campaign_plan").delete().eq("id", r.id), "campaign_delete", { id: r.id, name: r.name })}>Delete</button>
                    {spendFor === r.id && <AddSpend campaignId={r.id} day={clock} onDone={() => { setSpendFor(null); refresh(); }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="inline" style={{ marginTop: 10 }}>
        <input placeholder="New campaign" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ flex: 1, minWidth: 180 }} />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input placeholder="Owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} style={{ width: 110 }} />
        <input type="date" title="Start" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
        <input type="date" title="End" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
        <input type="number" placeholder="Budget ₹" value={draft.budget_inr} onChange={(e) => setDraft({ ...draft, budget_inr: e.target.value })} style={{ width: 100 }} />
        <input type="number" placeholder="Target deals" value={draft.target_deals} onChange={(e) => setDraft({ ...draft, target_deals: e.target.value })} style={{ width: 100 }} />
        <input type="number" placeholder="Target value ₹" value={draft.target_value_inr} onChange={(e) => setDraft({ ...draft, target_value_inr: e.target.value })} style={{ width: 120 }} />
        <select value={draft.bet_id} onChange={(e) => setDraft({ ...draft, bet_id: e.target.value })}><option value="">No bet</option>{bets.map((b, i) => <option key={b.id} value={b.id}>Bet {i + 1}</option>)}</select>
        <button className="btn primary" onClick={add}>Add campaign</button>
      </div>
    </div>
  );
}

function EditPlan({ r, onSave, onCancel }: { r: PlanRow; onSave: (c: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: r.name, owner: r.owner ?? "", start_date: r.start_date ?? "", end_date: r.end_date ?? "", budget_inr: String(r.budget_inr), target_deals: String(r.target_deals), target_value_inr: String(r.target_value_inr) });
  const [err, setErr] = useState("");
  function save() {
    if (!v.name.trim()) return setErr("Name needed");
    if (v.start_date && v.end_date && v.end_date < v.start_date) return setErr("End is before start");
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

function AddSpend({ campaignId, day, onDone }: { campaignId: number; day: string; onDone: () => void }) {
  const [amount, setAmount] = useState(""); const [on, setOn] = useState(day); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  async function save() {
    if (!amount || Number(amount) <= 0) return setErr("Enter an amount above 0.");
    const row = { campaign_id: campaignId, amount_inr: Number(amount), spent_on: on || null, note: note || null, created_by: "human" };
    const { error } = await sb.from("campaign_spend").insert(row);
    if (error) return setErr(error.message);
    await log("campaign_spend", row); onDone();
  }
  return (
    <div className="inline" style={{ marginTop: 6 }}>
      <input type="number" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 80 }} />
      <input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
      <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 110 }} />
      <button className="btn sm primary" onClick={save}>Save</button>
      {err && <span className="small" style={{ color: "var(--red)" }}>{err}</span>}
    </div>
  );
}
