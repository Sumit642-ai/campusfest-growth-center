import { useState } from "react";
import { log, OPEN, rpc, sb, type Opp } from "../lib/supabase";
import { useApp } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { fmtDate, inr, inrShort, STAGE_LABEL, STAGES } from "../lib/format";
import { ErrorBox, Loading } from "../components/ui";

type Hist = { stage: string; proposed_value_inr: number; confirmed_value_inr: number; owner_name: string; effective_at: string; history_id: string; origin: string;
  opportunity_name: string; brand_name: string; opportunity_id: string; brand_id: string; owner_id: string };

export default function Pipeline() {
  const { asOf, clock, version, refresh, ask } = useApp();
  const [open, setOpen] = useState<Opp | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = useAsync(() => rpc<Opp[]>("opp_snapshot", { d: asOf }), [asOf, version]);
  const canEdit = asOf >= clock;

  /** Append-only edit: copy the latest row, change stage/value, stamp it at the campaign clock. */
  async function edit(o: Opp, change: { stage?: string; value?: number }) {
    setBusy(true); setErr("");
    try {
      const hist = await rpc<Hist[]>("opp_history_asof", { opp: o.opportunity_id, d: clock });
      const last = hist[hist.length - 1];
      if (!last) throw new Error("This deal has no history on the campaign clock date.");
      const stage = change.stage ?? last.stage;
      const value = change.value ?? Number(last.proposed_value_inr);
      const row = {
        opportunity_name: last.opportunity_name, brand_name: last.brand_name, stage, proposed_value_inr: value,
        confirmed_value_inr: stage === "partner_confirmed" ? value : 0, owner_name: last.owner_name,
        effective_at: `${clock}T23:00:00+05:30`, history_id: `APP-${Date.now()}`, opportunity_id: last.opportunity_id,
        brand_id: last.brand_id, owner_id: last.owner_id,
      };
      const { error } = await sb.from("app_opp_history").insert(row);
      if (error) throw new Error(error.message);
      await log("opportunity_edit", { opportunity_id: o.opportunity_id, from: { stage: last.stage, value: last.proposed_value_inr }, to: { stage, value } });
      refresh();
      setOpen(null);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Loading />;
  const owners = [...new Set(s.data.map((o) => o.owner_name))].sort();
  const opps = s.data.filter((o) => !owner || o.owner_name === owner);
  const openOpps = opps.filter((o) => OPEN(o.stage));

  return (
    <>
      <h1>Pipeline</h1>
      <p className="sub">Every opportunity at its latest stage on {fmtDate(asOf)}. {openOpps.length} open, worth {inrShort(openOpps.reduce((a, o) => a + Number(o.proposed_value_inr), 0))}. Drag a card to change its stage, or click it to see its history.</p>
      {!canEdit && <div className="note blue">You're looking at an earlier date than the campaign clock ({fmtDate(clock)}). Edits are saved on the clock date, so editing is off here to avoid confusion. Move the as-of date to {fmtDate(clock)} or later to edit.</div>}
      <div className="note blue">Edits never change the source data. Each one adds a new history row dated on the campaign clock, so earlier dates still show what was true then.</div>
      {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="inline" style={{ marginBottom: 10 }}>
        <span className="muted">Owner</span>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Everyone</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
        <button className="btn sm" onClick={() => ask(`Which open deals can still close by fest eve, as of ${asOf}? Rank them and suggest tasks.`)}>What can still close? →</button>
      </div>
      <div className="board">
        {STAGES.map((st) => {
          const cards = opps.filter((o) => o.stage === st).sort((a, b) => b.days_in_stage - a.days_in_stage);
          const val = cards.reduce((a, o) => a + Number(st === "partner_confirmed" ? o.confirmed_value_inr : o.proposed_value_inr), 0);
          return (
            <div key={st} className={`col ${over === st ? "drop" : ""}`}
              onDragOver={(e) => { if (canEdit && drag) { e.preventDefault(); setOver(st); } }}
              onDragLeave={() => setOver(null)}
              onDrop={() => { setOver(null); const o = opps.find((x) => x.opportunity_id === drag); setDrag(null); if (o && o.stage !== st) edit(o, { stage: st }); }}>
              <div className="col-h">{STAGE_LABEL[st]} <span>{cards.length} · {inrShort(val)}</span></div>
              {cards.map((o) => (
                <div key={o.opportunity_id} className="opp" draggable={canEdit && !busy} onDragStart={() => setDrag(o.opportunity_id)} onClick={() => setOpen(o)}>
                  <b>{o.brand_name}</b>
                  <div className="row"><span>{inr(Number(o.proposed_value_inr))}</span><span>{o.owner_name.split(" ")[0]}</span></div>
                  <div className="row"><span>{o.industry}</span>
                    {OPEN(o.stage) ? <span className={`pill ${o.days_in_stage > 21 ? "red" : o.days_in_stage > 14 ? "amber" : "grey"}`}>{o.days_in_stage}d</span> : <span>{o.support_type === "in_kind" ? "in-kind" : ""}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {open && <Drawer o={open} asOf={asOf} canEdit={canEdit} busy={busy} onClose={() => setOpen(null)} onEdit={(c) => edit(open, c)} onAsk={() => ask(`Tell me about ${open.brand_name} (${open.opportunity_id}) as of ${asOf}: history, what's blocking it, and the next step.`)} />}
    </>
  );
}

function Drawer({ o, asOf, canEdit, busy, onClose, onEdit, onAsk }: { o: Opp; asOf: string; canEdit: boolean; busy: boolean; onClose: () => void; onEdit: (c: { stage?: string; value?: number }) => void; onAsk: () => void }) {
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
        <button className="btn sm" style={{ marginTop: 10 }} onClick={onAsk}>Ask the Analyst about this deal →</button>

        <h2 style={{ marginTop: 18 }}>Change it</h2>
        <div className="form">
          <select value={stage} disabled={!canEdit} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
          <input type="number" value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} />
          <button className="btn primary" disabled={!canEdit || busy || (stage === o.stage && Number(value) === Number(o.proposed_value_inr))}
            onClick={() => onEdit({ stage, value: Number(value) })}>{busy ? "Saving…" : "Save as a new history row"}</button>
          {!canEdit && <div className="small muted">Editing is off because the as-of date is before the campaign clock.</div>}
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
