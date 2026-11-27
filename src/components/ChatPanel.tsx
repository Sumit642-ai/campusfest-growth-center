import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { log, sb } from "../lib/supabase";
import { useApp } from "../lib/state";
import { fmtDate, inr } from "../lib/format";

type Draft = { title: string; owner: string; due_date: string; opportunity_id?: string; bet_id?: number; reason: string; state?: "pending" | "saved" | "cancelled" };
type Change = { campaign_id: number; campaign: string; field: "status" | "budget_inr"; from: unknown; to: unknown; reason: string; state?: "pending" | "saved" | "cancelled" | string };
type Turn = { role: "user" | "model"; text: string; trace?: { tool: string; args: unknown; result: unknown }[]; drafts?: Draft[]; changes?: Change[] };
const STARTERS = ["How are we doing vs target?", "Which campaigns produce deals?", "What's stuck in the pipeline?", "Which bets should we scale or stop?", "Where should we move campaign budget?"];

export default function ChatPanel() {
  const { chatOpen, setChatOpen, chatSeed, asOf, refresh } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const lastSeed = useRef(0);

  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" }); }, [turns, busy]);
  useEffect(() => {
    if (chatSeed && chatSeed.n !== lastSeed.current) { lastSeed.current = chatSeed.n; send(chatSeed.q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSeed]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: q.trim() }];
    setTurns(next); setText(""); setBusy(true);
    try {
      // The server gives up on the AI after 50 s and answers from the data it read; this 65 s cap is a safety net.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 65000);
      const { data, error } = await sb.functions.invoke("analyst", { body: { as_of: asOf, messages: next.map((t) => ({ role: t.role, text: t.text })) }, signal: ctl.signal }).finally(() => clearTimeout(timer));
      if (error || !data?.answer) throw new Error(error?.message ?? "empty");
      setTurns([...next, { role: "model", text: data.answer, trace: data.trace, drafts: (data.drafts ?? []).map((d: Draft) => ({ ...d, state: "pending" })), changes: (data.changes ?? []).map((c: Change) => ({ ...c, state: "pending" })) }]);
    } catch {
      setTurns([...next, { role: "model", text: "The AI didn't answer within a minute, so nothing was guessed. Ask again, or use the dashboard tiles, which don't need the AI." }]);
    } finally { setBusy(false); }
  }

  function setDraft(ti: number, di: number, patch: Partial<Draft>) {
    setTurns((ts) => ts.map((t, i) => (i !== ti ? t : { ...t, drafts: t.drafts!.map((d, j) => (j === di ? { ...d, ...patch } : d)) })));
  }
  async function confirm(ti: number, di: number, d: Draft) {
    const row = { title: d.title, owner: d.owner, due_date: d.due_date || null, opportunity_id: d.opportunity_id || null, bet_id: d.bet_id ?? null, reason: d.reason, created_by: "ai" };
    const { error } = await sb.from("tasks").insert(row);
    if (error) return alertInline(ti, di, error.message);
    await log("task_confirmed_from_ai", row);
    setDraft(ti, di, { state: "saved" }); refresh();
  }
  function setChange(ti: number, ci: number, patch: Partial<Change>) {
    setTurns((ts) => ts.map((t, i) => (i !== ti ? t : { ...t, changes: t.changes!.map((c, j) => (j === ci ? { ...c, ...patch } : c)) })));
  }
  async function confirmChange(ti: number, ci: number, c: Change) {
    const { error } = await sb.from("campaign_plan").update({ [c.field]: c.to, updated_at: new Date().toISOString() }).eq("id", c.campaign_id);
    if (error) return setChange(ti, ci, { state: `error: ${error.message}` });
    await log("campaign_change_confirmed_from_ai", c as unknown as Record<string, unknown>);
    setChange(ti, ci, { state: "saved" }); refresh();
  }
  function alertInline(ti: number, di: number, msg: string) { setDraft(ti, di, { reason: `${msg}` }); }

  if (!chatOpen) return null;
  return (
    <>
      <div className="drawer-bg" onClick={() => setChatOpen(false)} />
      <div className="drawer chat">
        <div className="chat-h">
          <div><b>Ask the Analyst</b><div className="small muted">Answers from live data as of {fmtDate(asOf)}. Shows its working.</div></div>
          <div className="inline"><button className="btn sm" onClick={() => setTurns([])}>Clear</button><button className="x" onClick={() => setChatOpen(false)}>×</button></div>
        </div>
        <div className="chat-body" ref={body}>
          {turns.length === 0 && <div className="muted small">Ask anything about the sponsorship season. Every number comes from a database query, never from the AI's memory. If the data can't answer, it will say so.</div>}
          {turns.map((t, ti) => (
            <div key={ti} className={`msg ${t.role}`}>
              {t.role === "user" ? t.text : <Markdown>{t.text}</Markdown>}
              {t.changes?.map((c, ci) => <ChangeCard key={`c${ci}`} c={c} onCancel={() => setChange(ti, ci, { state: "cancelled" })} onConfirm={() => confirmChange(ti, ci, c)} />)}
              {t.drafts?.map((d, di) => <DraftCard key={di} d={d} onChange={(p) => setDraft(ti, di, p)} onConfirm={() => confirm(ti, di, d)} />)}
              {t.trace && t.trace.length > 0 && (
                <details className="working">
                  <summary>Show working ({t.trace.length} {t.trace.length === 1 ? "query" : "queries"})</summary>
                  {t.trace.map((x, i) => (
                    <div key={i} style={{ marginTop: 6 }}>
                      <b>{x.tool}</b> <code className="small">{JSON.stringify(x.args)}</code>
                      <pre>{preview(x.result)}</pre>
                    </div>
                  ))}
                </details>
              )}
            </div>
          ))}
          {busy && <Progress />}
        </div>
        <div className="chat-foot">
          <div className="starters">{STARTERS.map((s) => <button key={s} onClick={() => send(s)} disabled={busy}>{s}</button>)}</div>
          <form onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea value={text} placeholder="e.g. How many qualified brands did we have on 1 March?" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
            <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
          </form>
        </div>
      </div>
    </>
  );
}

const STEPS = ["Reading your question", "Querying the live database", "Checking the numbers", "Writing the answer"];
/** Shows where the analyst probably is, with elapsed time, so a 20-second wait doesn't feel frozen. */
function Progress() {
  const [t, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  const step = t < 2 ? 0 : t < 9 ? 1 : t < 15 ? 2 : 3;
  return (
    <div className="progress" aria-live="polite">
      {STEPS.map((st, i) => <div key={st} className={i < step ? "done" : i === step ? "now" : ""}>{i < step ? "✓" : i === step ? "●" : "○"} {st}</div>)}
      <div className="small muted">{t}s · usually 10–30 seconds{t > 30 ? ". The free model may be busy; it retries backup models automatically." : ""}</div>
    </div>
  );
}

function DraftCard({ d, onChange, onConfirm }: { d: Draft; onChange: (p: Partial<Draft>) => void; onConfirm: () => void }) {
  const [editing, setEditing] = useState(false);
  if (d.state === "saved") return <div className="draft"><span className="pill green">Saved to Tasks</span> {d.title}</div>;
  if (d.state === "cancelled") return <div className="draft muted">Draft cancelled: {d.title}</div>;
  return (
    <div className="draft">
      <div className="small muted" style={{ marginBottom: 4 }}>Draft task, not saved until you confirm</div>
      {editing ? (
        <div className="form">
          <input value={d.title} onChange={(e) => onChange({ title: e.target.value })} />
          <input value={d.owner} onChange={(e) => onChange({ owner: e.target.value })} />
          <input type="date" value={d.due_date} onChange={(e) => onChange({ due_date: e.target.value })} />
        </div>
      ) : (
        <>
          <b>{d.title}</b>
          <div className="small">{d.owner} · due {d.due_date ? fmtDate(d.due_date) : "–"}{d.opportunity_id ? ` · ${d.opportunity_id}` : ""}</div>
          <div className="small muted">{d.reason}</div>
        </>
      )}
      <div className="inline" style={{ marginTop: 6 }}>
        <button className="btn sm primary" onClick={onConfirm}>Confirm</button>
        <button className="btn sm" onClick={() => setEditing(!editing)}>{editing ? "Done editing" : "Edit"}</button>
        <button className="btn sm" onClick={() => onChange({ state: "cancelled" })}>Cancel</button>
      </div>
    </div>
  );
}

function ChangeCard({ c, onConfirm, onCancel }: { c: Change; onConfirm: () => void; onCancel: () => void }) {
  const show = (v: unknown) => (c.field === "budget_inr" ? inr(Number(v)) : String(v));
  const what = `${c.campaign}: ${c.field === "budget_inr" ? "budget" : "status"} ${show(c.from)} → ${show(c.to)}`;
  if (c.state === "saved") return <div className="draft"><span className="pill green">Saved to campaign plan</span> {what}</div>;
  if (c.state === "cancelled") return <div className="draft muted">Change cancelled: {what}</div>;
  return (
    <div className="draft">
      <div className="small muted" style={{ marginBottom: 4 }}>Draft campaign change, not saved until you confirm</div>
      <b>{what}</b>
      <div className="small muted">{c.reason}</div>
      {c.state?.startsWith("error") && <div className="small" style={{ color: "var(--red)" }}>{c.state}</div>}
      <div className="inline" style={{ marginTop: 6 }}>
        <button className="btn sm primary" onClick={onConfirm}>Confirm</button>
        <button className="btn sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function preview(v: unknown) {
  const s = JSON.stringify(v, null, 1);
  return s.length > 1200 ? s.slice(0, 1200) + "\n…" : s;
}
