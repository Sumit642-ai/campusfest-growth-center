import type React from "react";
import { useState } from "react";
import { log, sb, table } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { fmtDate, inr, inrShort } from "../lib/format";
import { ErrorBox, Loading } from "../components/ui";

export type Bet = { id: number; name: string; finding: string; budget_inr: number; spent_inr: number; owner: string; start_date: string; end_date: string; extra_if_works_inr: number; chance: number; ev_inr: number };
type Threshold = { id: number; bet_id: number; metric: string; min_sample: number; scale_if: number; stop_if: number; guardrail: string; first_read: string; rule_text: string };
type Reading = { id: number; bet_id: number; measured_on: string; sample: number; value: number; note: string | null; created_by: string };
export type Task = { id: number; title: string; owner: string; due_date: string | null; status: string; opportunity_id: string | null; bet_id: number | null; reason: string | null; created_by: string };

/** Demo readings only show how the badge works; they never set it. */
export const isDemo = (r: Reading) => r.created_by === "seed" || /demo/i.test(r.note ?? "");

/** Same rule as the analyst's evaluate_bets tool. */
export function betCall(th: Threshold | undefined, last: Reading | undefined) {
  if (!th) return { label: "No threshold", tone: "grey" };
  if (!last) return { label: "No real data yet", tone: "grey" };
  if (last.sample < th.min_sample) return { label: `Not enough data (${last.sample} of ${th.min_sample})`, tone: "grey" };
  if (Number(last.value) >= Number(th.scale_if)) return { label: "Scale", tone: "green" };
  if (Number(last.value) <= Number(th.stop_if)) return { label: "Stop", tone: "red" };
  return { label: "Change", tone: "amber" };
}

export default function BetsTasks() {
  const { version, refresh, ask, confirm, toast } = useApp();
  const s = useAsync(async () => {
    const [bets, ths, readings, tasks, camps] = await Promise.all([table<Bet>("bets", "id"), table<Threshold>("thresholds"), table<Reading>("bet_metrics", "measured_on"), table<Task>("tasks", "id"), table<{ bet_id: number | null; spent_inr: number; name: string }>("v_campaign_budget")]);
    return { bets, ths, readings, tasks, camps };
  }, [version]);
  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const { bets, ths, readings, tasks, camps } = s.data;
  const spentOn = (id: number) => Number(bets.find((b) => b.id === id)?.spent_inr ?? 0) + camps.filter((c) => c.bet_id === id).reduce((a, c) => a + Number(c.spent_inr), 0);
  const totalEv = bets.reduce((a, b) => a + Number(b.ev_inr), 0), totalBudget = bets.reduce((a, b) => a + Number(b.budget_inr), 0);
  const perRupee = (b: Bet) => Number(b.budget_inr) ? Number(b.ev_inr) / Number(b.budget_inr) : 0;
  const ranked = [...bets].sort((a, b) => perRupee(b) - perRupee(a));

  return (
    <>
      <h1>Bets & Tasks</h1>
      <p className="sub">Five bets for next season, ranked by expected value per rupee of budget (EV ÷ budget), the same order as the deck. Total expected extra {inrShort(totalEv)} for {inrShort(totalBudget)} of budget. Each bet turns green, amber or red from its latest real reading against the scale and stop lines below.</p>
      <div className="recon">
        <b>How the numbers fit:</b> base plan (renewals + warm list, no bets) <b>₹26.6L</b> + expected extra from the five bets <b>{inrShort(totalEv)}</b> = <b>{inrShort(2660000 + totalEv)}</b>, which rounds to the ₹41L target on slides 1 and 2 (simulated P50 ₹40.5L).
        Bet 5 adds a premium on deals we already sign, so it adds value but no new deals. The campaign plan on Funnel & Campaigns splits the same ₹41L into 38 deals.
      </div>
      <div className="note blue">These bets run in the next season, CampusFest 2027 (Jan–Mar 2027, fest 10–11 Apr 2027), so the 2025 as-of date in the top bar doesn't apply here. Readings are dated in the 2027 calendar. Demo readings are shown for illustration only and never set the badge.</div>
      <div className="inline" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => ask("Which bets should we scale, change or stop right now? Show the numbers and suggest tasks.")}>Which bets should we scale or stop? →</button>
      </div>
      <div className="bets">
        {ranked.map((b, i) => {
          const th = ths.find((t) => t.bet_id === b.id);
          const rs = readings.filter((r) => r.bet_id === b.id).sort((x, y) => x.measured_on.localeCompare(y.measured_on) || x.id - y.id);
          const real = rs.filter((r) => !isDemo(r));
          const last = real[real.length - 1];
          const demo = rs.filter(isDemo).pop();
          const call = betCall(th, last);
          return (
            <div key={b.id} className="card bet">
              <div className="inline" style={{ justifyContent: "space-between" }}>
                <h3>{i + 1}. {b.name} <span className="muted small">· Bet {b.id}</span></h3><span className={`pill ${call.tone}`}>{call.label}</span>
              </div>
              <div className="small muted">Fixes: {b.finding}</div>
              {th && <div className="rule">{th.rule_text}</div>}
              <dl className="kv">
                <dt>Metric</dt><dd>{th?.metric}</dd>
                <dt>Latest</dt><dd>{last ? <>{last.value} on {fmtDate(last.measured_on)}, sample {last.sample}{last.note && <span className="muted"> · {last.note}</span>}</> : "No real reading yet"}
                  {demo && <div className="small muted"><span className="pill grey">demo</span> {demo.value} on {fmtDate(demo.measured_on)}, sample {demo.sample}: illustration only, not used</div>}</dd>
                <dt>First read</dt><dd>{th?.first_read} (min sample {th?.min_sample})</dd>
                <dt>Guardrail</dt><dd>{th?.guardrail}</dd>
                <dt>EV</dt><dd>{inrShort(Number(b.extra_if_works_inr))} if it works × {Math.round(b.chance * 100)}% = <b>{inrShort(Number(b.ev_inr))}</b> · <b>{perRupee(b).toFixed(1)}×</b> per ₹ of budget</dd>
                <dt>Runs</dt><dd>{fmtDate(b.start_date)} to {fmtDate(b.end_date)}</dd>
                <dt>Budget</dt><dd>{inr(spentOn(b.id))} spent of {inr(Number(b.budget_inr))} · {b.owner}<span className="muted"> · spend logged on {camps.filter((c) => c.bet_id === b.id).map((c) => c.name).join(", ") || "no campaign"}</span></dd>
              </dl>
              <AddReading bet={b} onDone={() => { refresh(); toast(`Reading saved for ${b.name}.`); }} />
            </div>
          );
        })}
      </div>
      <Tasks tasks={tasks} bets={bets} onChange={refresh} confirm={confirm} toast={toast} />
    </>
  );
}

function AddReading({ bet, onDone }: { bet: Bet; onDone: () => void }) {
  const betId = bet.id;
  const [openForm, setOpenForm] = useState(false);
  const [sample, setSample] = useState(""); const [value, setValue] = useState(""); const [err, setErr] = useState(""); const [day, setDay] = useState(bet.start_date);
  if (!openForm) return <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpenForm(true)}>+ Add reading</button>;
  async function save() {
    if (sample === "" || value === "") return setErr("Enter both numbers.");
    if (Number(sample) < 0 || Number(value) < 0) return setErr("Numbers can't be negative.");
    if (day < bet.start_date || day > bet.end_date) return setErr(`Pick a date while the bet runs (${fmtDate(bet.start_date)} to ${fmtDate(bet.end_date)}).`);
    const { error } = await sb.from("bet_metrics").insert({ bet_id: betId, measured_on: day, sample: Number(sample), value: Number(value), created_by: "app" });
    if (error) return setErr(error.message);
    await log("bet_reading", { bet_id: betId, sample, value });
    setOpenForm(false); setSample(""); setValue(""); onDone();
  }
  return (
    <div className="inline" style={{ marginTop: 10 }}>
      <input type="date" aria-label="Reading date" value={day} min={bet.start_date} max={bet.end_date} onChange={(e) => setDay(e.target.value)} />
      <input type="number" placeholder="Sample" value={sample} onChange={(e) => setSample(e.target.value)} style={{ width: 80 }} />
      <input type="number" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 80 }} />
      <button className="btn sm primary" onClick={save}>Save</button><button className="btn sm" onClick={() => setOpenForm(false)}>Cancel</button>
      {err && <span className="small" style={{ color: "var(--red)" }}>{err}</span>}
    </div>
  );
}

type ConfirmFn = (title: string, opts?: { body?: React.ReactNode; ok?: string; danger?: boolean }) => Promise<boolean>;
function Tasks({ tasks, bets, onChange, confirm, toast }: { tasks: Task[]; bets: Bet[]; onChange: () => void; confirm: ConfirmFn; toast: (t: string) => void }) {
  const [filter, setFilter] = useState("open");
  const [draft, setDraft] = useState({ title: "", owner: "", due_date: "", bet_id: "", opportunity_id: "" });
  const [editing, setEditing] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const shown = tasks.filter((t) => filter === "all" || t.status === filter);

  async function run(p: PromiseLike<{ error: { message: string } | null }>, action: string, detail: Record<string, unknown>) {
    const { error } = await p;
    if (error) return setErr(error.message);
    await log(action, detail); setErr(""); onChange();
  }
  async function add() {
    if (!draft.title.trim()) return setErr("A task needs a title.");
    const row = { title: draft.title, owner: draft.owner || null, due_date: draft.due_date || null, bet_id: draft.bet_id ? Number(draft.bet_id) : null, opportunity_id: draft.opportunity_id || null, created_by: "human" };
    await run(sb.from("tasks").insert(row), "task_create", row);
    setDraft({ title: "", owner: "", due_date: "", bet_id: "", opportunity_id: "" });
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="inline" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Tasks</h2>
        <div className="inline">{["open", "done", "all"].map((f) => <button key={f} className={`btn sm ${filter === f ? "primary" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
      </div>
      {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Linked to</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map((t) => editing === t.id ? (
              <EditRow key={t.id} t={t} onCancel={() => setEditing(null)} onSave={(c) => { setEditing(null); run(sb.from("tasks").update(c).eq("id", t.id), "task_edit", { id: t.id, ...c }); }} />
            ) : (
              <tr key={t.id}>
                <td>{t.status === "done" ? <s>{t.title}</s> : t.title} {t.created_by === "ai" && <span className="pill blue">created by AI</span>}
                  {t.reason && <div className="small muted">{t.reason}</div>}</td>
                <td>{t.owner}</td>
                <td>{t.due_date ? fmtDate(t.due_date) : ""}</td>
                <td className="small">{t.opportunity_id ?? ""}{t.bet_id ? `Bet ${t.bet_id}` : ""}</td>
                <td><span className={`pill ${t.status === "done" ? "green" : "grey"}`}>{t.status}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn sm" onClick={() => run(sb.from("tasks").update({ status: t.status === "done" ? "open" : "done" }).eq("id", t.id), "task_status", { id: t.id })}>{t.status === "done" ? "Reopen" : "Done"}</button>{" "}
                  <button className="btn sm" onClick={() => setEditing(t.id)}>Edit</button>{" "}
                  <button className="btn sm danger" onClick={async () => { if (await confirm("Delete this task?", { body: <p>“{t.title}” will be removed.</p>, ok: "Delete", danger: true })) { await run(sb.from("tasks").delete().eq("id", t.id), "task_delete", { id: t.id, title: t.title }); toast("Task deleted."); } }}>Delete</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="muted">No {filter === "all" ? "" : filter} tasks.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="inline" style={{ marginTop: 10 }}>
        <input placeholder="New task" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
        <input placeholder="Owner" value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} style={{ width: 120 }} />
        <input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
        <select value={draft.bet_id} onChange={(e) => setDraft({ ...draft, bet_id: e.target.value })}><option value="">No bet</option>{bets.map((b) => <option key={b.id} value={b.id}>Bet {b.id}: {b.name}</option>)}</select>
        <input placeholder="Deal id (e.g. O048)" value={draft.opportunity_id} onChange={(e) => setDraft({ ...draft, opportunity_id: e.target.value })} style={{ width: 130 }} />
        <button className="btn primary" onClick={add}>Add task</button>
      </div>
    </div>
  );
}

function EditRow({ t, onSave, onCancel }: { t: Task; onSave: (c: Partial<Task>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ title: t.title, owner: t.owner ?? "", due_date: t.due_date ?? "" });
  return (
    <tr>
      <td><input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} style={{ width: "100%" }} /></td>
      <td><input value={v.owner} onChange={(e) => setV({ ...v, owner: e.target.value })} style={{ width: 110 }} /></td>
      <td><input type="date" value={v.due_date} onChange={(e) => setV({ ...v, due_date: e.target.value })} /></td>
      <td colSpan={2} />
      <td style={{ whiteSpace: "nowrap" }}><button className="btn sm primary" onClick={() => onSave({ title: v.title, owner: v.owner || null as any, due_date: v.due_date || null })}>Save</button> <button className="btn sm" onClick={onCancel}>Cancel</button></td>
    </tr>
  );
}
