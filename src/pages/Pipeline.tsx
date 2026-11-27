import { useState } from "react";
import { log, OPEN, rpc, sb, table, type Opp } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { addDays, fmtDate, inr, inrShort, STAGE_LABEL, STAGES } from "../lib/format";
import { ErrorBox, Loading } from "../components/ui";

type Hist = { stage: string; proposed_value_inr: number; confirmed_value_inr: number; owner_name: string; effective_at: string; history_id: string; origin: string;
  opportunity_name: string; brand_name: string; opportunity_id: string; brand_id: string; owner_id: string };

const RANK: Record<string, number> = { prospecting: 0, contacted: 1, proposal_sent: 2, negotiating: 3, partner_confirmed: 4 };
// Lost and Withdrawn share one column so the board fits the screen.
const COLS = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "closed"] as const;
const COL_LABEL: Record<string, string> = { ...STAGE_LABEL, closed: "Lost / withdrawn" };
const colOf = (stage: string) => (stage === "lost" || stage === "withdrawn" ? "closed" : stage);
type Move = { o: Opp; to: string; value: number };

export default function Pipeline() {
  const { asOf, setAsOf, clock, version, refresh, ask, toast } = useApp();
  const [move, setMove] = useState<Move | null>(null);
  const [open, setOpen] = useState<Opp | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = useAsync(async () => {
    const [opps, brands, tasks] = await Promise.all([
      rpc<Opp[]>("opp_snapshot", { d: asOf }),
      table<{ owner_name: string }>("src_brands"),
      table<{ opportunity_id: string | null; status: string }>("tasks"),
    ]);
    return { opps, brandOwners: brands.map((b) => b.owner_name), tasked: new Set(tasks.filter((t) => t.status === "open" && t.opportunity_id).map((t) => t.opportunity_id!)) };
  }, [asOf, version]);
  const canEdit = asOf >= clock;

  /** Every stage or value change goes through a check step first (skipped stages, confirmed value). */
  function requestEdit(o: Opp, change: { stage?: string; value?: number }) {
    const to = change.stage ?? o.stage;
    setMove({ o, to, value: change.value ?? Number(o.proposed_value_inr) });
  }

  /** Append-only edit: copy the latest row, change stage/value, stamp it at the campaign clock. */
  async function edit(o: Opp, change: { stage?: string; value?: number }) {
    setBusy(true); setErr("");
    try {
      const hist = await rpc<Hist[]>("opp_history_asof", { opp: o.opportunity_id, d: clock });
      const last = hist[hist.length - 1];
      if (!last) throw new Error("This deal has no history on the edit date.");
      const stage = change.stage ?? last.stage;
      const value = change.value ?? Number(last.proposed_value_inr);
      const row = {
        opportunity_name: last.opportunity_name, brand_name: last.brand_name, stage, proposed_value_inr: value,
        confirmed_value_inr: stage === "partner_confirmed" ? value : 0, owner_name: last.owner_name,
        // proposed value stays as last proposed when confirming at a different amount
        effective_at: `${clock}T23:00:00+05:30`, history_id: `APP-${Date.now()}`, opportunity_id: last.opportunity_id,
        brand_id: last.brand_id, owner_id: last.owner_id,
      };
      const { error } = await sb.from("app_opp_history").insert(row);
      if (error) throw new Error(error.message);
      await log("opportunity_edit", { opportunity_id: o.opportunity_id, from: { stage: last.stage, value: last.proposed_value_inr }, to: { stage, value } });
      refresh();
      setOpen(null); setMove(null);
      toast(`${o.brand_name} moved to ${STAGE_LABEL[stage]}${stage === "partner_confirmed" ? ` at ${inr(value)}` : ""}.`, async () => {
        const { error: e2 } = await sb.from("app_opp_history").delete().eq("history_id", row.history_id);
        if (e2) return toast(`Couldn't undo: ${e2.message}`, undefined, "err");
        await log("opportunity_edit_undo", { opportunity_id: o.opportunity_id, history_id: row.history_id });
        refresh(); toast("Change undone.");
      });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function createTasks(list: Opp[]) {
    if (!list.length) return;
    const rows = list.map((o) => ({ title: `Unblock ${o.brand_name}: agree a next step or close as lost`, owner: o.owner_name, due_date: addDays(clock, 2),
      opportunity_id: o.opportunity_id, reason: `${STAGE_LABEL[o.stage]} for ${o.days_in_stage} days; every 2025 deal that closed did so within 13 days`, created_by: "human" }));
    const { error } = await sb.from("tasks").insert(rows);
    if (error) return setErr(error.message);
    await log("stuck_tasks_create", { count: rows.length, ids: list.map((o) => o.opportunity_id) });
    refresh(); toast(`${rows.length} ${rows.length === 1 ? "task" : "tasks"} created on Bets & Tasks.`);
  }

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const { tasked } = s.data;
  const dealCount = (n: string) => s.data!.opps.filter((o) => o.owner_name === n).length;
  const owners = [...new Set([...s.data.opps.map((o) => o.owner_name), ...s.data.brandOwners])].filter(Boolean).sort();
  const opps = s.data.opps.filter((o) => !owner || o.owner_name === owner);
  const openOpps = opps.filter((o) => OPEN(o.stage));
  const stuckNoTask = openOpps.filter((o) => o.days_in_stage > 14 && !tasked.has(o.opportunity_id));

  return (
    <>
      <h1>Pipeline</h1>
      <p className="sub">Every opportunity at its latest stage on {fmtDate(asOf)}. {openOpps.length} open, worth {inrShort(openOpps.reduce((a, o) => a + Number(o.proposed_value_inr), 0))}. Drag a card to change its stage, or click it to see its history.</p>
      {!canEdit && <div className="note blue">Editing is off on this date. Edits are saved on the edit date ({fmtDate(clock)}, fest eve by default), and saving them while you look at an earlier date would be confusing. <div style={{ marginTop: 8 }}><button className="btn sm primary" onClick={() => setAsOf(clock)}>Edit on {fmtDate(clock)} (fest eve) →</button></div></div>}
      <div className="note blue">Edits never change the source data. Each one adds a new history row dated on the edit date, so earlier dates still show what was true then. Every change shows a check step first and can be undone.</div>
      {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="inline" style={{ marginBottom: 10 }}>
        <span className="muted">Owner</span>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Everyone</option>{owners.map((o) => <option key={o} value={o}>{o} ({dealCount(o)} deals)</option>)}</select>
        {stuckNoTask.length > 0 && <button className="btn sm primary" disabled={!canEdit} title={canEdit ? "" : "Move the as-of date to the edit date to create tasks"} onClick={() => createTasks(stuckNoTask)}>Create tasks for {stuckNoTask.length} stuck {stuckNoTask.length === 1 ? "deal" : "deals"}</button>}
        <button className="btn sm" onClick={() => ask(`Which open deals can still close by fest eve, as of ${asOf}? Rank them and suggest tasks.`)}>What can still close? →</button>
      </div>
      <div className="board">
        {COLS.map((st) => {
          const cards = opps.filter((o) => colOf(o.stage) === st).sort((a, b) => b.days_in_stage - a.days_in_stage);
          const val = cards.reduce((a, o) => a + Number(st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr), 0);
          const dropTo = st === "closed" ? "lost" : st;
          return (
            <div key={st} className={`col ${over === st ? "drop" : ""}`}
              onDragOver={(e) => { if (canEdit && drag) { e.preventDefault(); setOver(st); } }}
              onDragLeave={() => setOver(null)}
              onDrop={() => { setOver(null); const o = opps.find((x) => x.opportunity_id === drag); setDrag(null); if (o && colOf(o.stage) !== st) requestEdit(o, { stage: dropTo }); }}>
              <div className="col-h">{COL_LABEL[st]} <span>{cards.length} · {inrShort(val)}</span></div>
              {cards.map((o) => (
                <div key={o.opportunity_id} className="opp" draggable={canEdit && !busy} onDragStart={() => setDrag(o.opportunity_id)} onClick={() => setOpen(o)}>
                  <b>{o.brand_name} <span className="oid">{o.opportunity_id}</span></b>
                  <div className="row"><span>{inr(Number(st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr))}</span><span>{o.owner_name.split(" ")[0]}</span></div>
                  <div className="row"><span>{st === "closed" ? STAGE_LABEL[o.stage] : o.industry}</span>
                    {OPEN(o.stage) ? <span className={`pill ${o.days_in_stage > 21 ? "red" : o.days_in_stage > 14 ? "amber" : "grey"}`}>{o.days_in_stage}d</span> : <span>{o.support_type === "in_kind" ? "in-kind" : ""}</span>}
                  </div>
                  {OPEN(o.stage) && o.days_in_stage > 14 && (tasked.has(o.opportunity_id)
                    ? <div className="small muted" style={{ marginTop: 4 }}>✓ task open</div>
                    : canEdit && <button className="btn sm" style={{ marginTop: 6 }} onClick={(e) => { e.stopPropagation(); createTasks([o]); }}>+ Create task</button>)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {move && <MoveDialog m={move} clock={clock} busy={busy} onCancel={() => setMove(null)} onSave={(value) => edit(move.o, { stage: move.to, value })} />}
      {open && <Drawer o={open} asOf={asOf} canEdit={canEdit} busy={busy} hasTask={tasked.has(open.opportunity_id)} onTask={() => createTasks([open])} onClose={() => setOpen(null)} onEdit={(c) => requestEdit(open, c)} onAsk={() => ask(`Tell me about ${open.brand_name} (${open.opportunity_id}) as of ${asOf}: history, what's blocking it, and the next step.`)} />}
    </>
  );
}

function MoveDialog({ m, clock, busy, onCancel, onSave }: { m: Move; clock: string; busy: boolean; onCancel: () => void; onSave: (value: number) => void }) {
  const { o, to } = m;
  const [value, setValue] = useState(String(m.value));
  const from = o.stage;
  const skipped = OPEN(from) && RANK[to] != null && RANK[to] - (RANK[from] ?? 0) > 1;
  const reopening = !OPEN(from) && OPEN(to);
  const toConfirmed = to === "partner_confirmed";
  const v = Number(value);
  const valid = value !== "" && v > 0;
  return (
    <>
      <div className="drawer-bg" style={{ zIndex: 40 }} onClick={onCancel} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Check this change">
        <h2>Move {o.brand_name} ({o.opportunity_id})</h2>
        <p><b>{STAGE_LABEL[from]}</b> → <b>{STAGE_LABEL[to]}</b>, saved on {fmtDate(clock)}.</p>
        {skipped && <div className="note">This skips {RANK[to] - RANK[from] - 1} {RANK[to] - RANK[from] - 1 === 1 ? "stage" : "stages"}. In 2025 no deal jumped straight from {STAGE_LABEL[from]} to {STAGE_LABEL[to]}. Only continue if that really happened.</div>}
        {OPEN(from) && o.days_in_stage > 14 && toConfirmed && <div className="note">This deal has been idle for {o.days_in_stage} days. Every deal that closed in 2025 did so within 13 days, so double-check before confirming.</div>}
        {reopening && <div className="note">This reopens a closed deal.</div>}
        {from === "partner_confirmed" && !toConfirmed && <div className="note">This removes a confirmed partnership ({inr(Number(o.confirmed_value_inr))}). It will show as withdrawn or lost on Mission Control.</div>}
        <label className="form" style={{ marginTop: 8 }}>
          <span className="small muted">{toConfirmed ? "Confirmed value (₹), required" : "Proposed value (₹)"}</span>
          <input type="number" min={1} value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
          {!valid && <span className="small" style={{ color: "var(--red)" }}>Enter a value above ₹0.</span>}
        </label>
        <div className="inline" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!valid || busy} onClick={() => onSave(v)}>{busy ? "Saving…" : toConfirmed ? `Confirm at ${valid ? inr(v) : "…"}` : "Save change"}</button>
        </div>
      </div>
    </>
  );
}

function Drawer({ o, asOf, canEdit, busy, hasTask, onTask, onClose, onEdit, onAsk }: { o: Opp; asOf: string; canEdit: boolean; busy: boolean; hasTask: boolean; onTask: () => void; onClose: () => void; onEdit: (c: { stage?: string; value?: number }) => void; onAsk: () => void }) {
  const h = useAsync(() => rpc<Hist[]>("opp_history_asof", { opp: o.opportunity_id, d: asOf }), [o.opportunity_id, asOf]);
  const [stage, setStage] = useState(o.stage);
  const [value, setValue] = useState(String(o.proposed_value_inr));
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-h"><div><h2 style={{ margin: 0 }}>{o.brand_name}</h2><div className="small muted">{o.opportunity_id} · {o.opportunity_name}</div></div><button className="x" onClick={onClose}>×</button></div>
        <dl className="kv">
          <dt>Stage</dt><dd>{STAGE_LABEL[o.stage]} ({o.days_in_stage} days)</dd>
          <dt>Proposed value</dt><dd>{inr(Number(o.proposed_value_inr))}</dd>
          <dt>Confirmed value</dt><dd>{inr(Number(o.confirmed_value_inr))}</dd>
          <dt>Support type</dt><dd>{o.support_type === "in_kind" ? "In-kind" : "Cash"}</dd>
          <dt>Owner</dt><dd>{o.owner_name}</dd>
          <dt>Industry</dt><dd>{o.industry}</dd>
          <dt>Campaign</dt><dd>{o.originating_campaign_name}</dd>
        </dl>
        <div className="inline" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={onAsk}>Ask the Analyst about this deal →</button>
          {OPEN(o.stage) && (hasTask ? <span className="small muted">✓ A task is open for this deal</span> : <button className="btn sm" disabled={!canEdit} onClick={onTask}>+ Create task</button>)}
        </div>

        <h2 style={{ marginTop: 18 }}>Change it</h2>
        <div className="form">
          <select value={stage} disabled={!canEdit} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
          <input type="number" value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
          <button className="btn primary" disabled={!canEdit || busy || (stage === o.stage && Number(value) === Number(o.proposed_value_inr))}
            onClick={() => onEdit({ stage, value: Number(value) })}>{busy ? "Saving…" : "Review and save…"}</button>
          {!canEdit && <div className="small muted">Editing is off because the as-of date is before the edit date.</div>}
        </div>

        <h2 style={{ marginTop: 18 }}>History up to {fmtDate(asOf)}</h2>
        {h.data ? (
          <table className="t">
            <thead><tr><th>Date</th><th>Stage</th><th className="r">Proposed</th><th>By</th></tr></thead>
            <tbody>
              {[...h.data].reverse().map((r) => (
                <tr key={r.history_id}>
                  <td>{fmtDate(new Date(r.effective_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }))}</td>
                  <td>{STAGE_LABEL[r.stage]}</td>
                  <td className="r">{inr(Number(r.proposed_value_inr))}</td>
                  <td>{r.origin === "app" ? <span className="pill blue">app edit</span> : <span className="small muted">source</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Loading />}
      </div>
    </>
  );
}
