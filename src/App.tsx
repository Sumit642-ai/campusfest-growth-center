import { useEffect, useState } from "react";
import { configured, rpc } from "./lib/supabase";
import { FEST_EVE, SEASON_END, SEASON_START, useApp } from "./lib/state";
import { fmtDate } from "./lib/format";
import ChatPanel from "./components/ChatPanel";
import MissionControl from "./pages/MissionControl";
import Funnel from "./pages/Funnel";
import Pipeline from "./pages/Pipeline";
import BetsTasks from "./pages/BetsTasks";
import CashScenarios from "./pages/CashScenarios";

const PAGES = [
  { id: "mission", label: "Mission Control", el: <MissionControl /> },
  { id: "funnel", label: "Funnel & Campaigns", el: <Funnel /> },
  { id: "pipeline", label: "Pipeline", el: <Pipeline /> },
  { id: "bets", label: "Bets & Tasks", el: <BetsTasks /> },
  { id: "cash", label: "Cash & Scenarios", el: <CashScenarios /> },
];
const QUICK = [["15 Feb", "2025-02-15"], ["15 Mar", "2025-03-15"], ["11 Apr (fest eve)", "2025-04-11"], ["20 Apr (end)", SEASON_END]];

function useHash() {
  const [h, setH] = useState(() => location.hash.slice(1) || "mission");
  useEffect(() => { const f = () => setH(location.hash.slice(1) || "mission"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h;
}

export default function App() {
  const page = useHash();
  const { asOf, setAsOf, clock, setClock, setChatOpen, refresh, confirm, toast } = useApp();
  if (!configured) return <Setup />;
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];

  async function reset() {
    const ok = await confirm("Reset the demo data?", { ok: "Reset everything", danger: true,
      body: <p>This removes every edit, task, reading and payment added in the app, for every visitor, and restores the seeded plan. The 2025 source data is never touched. This is a demo-only control; a real team would put it behind an admin login.</p> });
    if (!ok) return;
    await rpc("reset_demo", {});
    refresh(); toast("Demo data reset.");
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Sponsor Growth Center<span>CampusFest · sponsorship</span></div>
        {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} className={`nav ${p.id === current.id ? "on" : ""}`}>{p.label}</a>)}
        <div className="side-foot">
          <details className="adv">
            <summary>Advanced: edit date</summary>
            <div style={{ marginTop: 6 }}>Pipeline edits are saved on this date (23:00 IST), so they fit into the 2025 timeline. It stops at fest eve ({fmtDate(FEST_EVE)}).</div>
            <input type="date" aria-label="Edit date" value={clock} min={SEASON_START} max={FEST_EVE} onChange={(e) => e.target.value && setClock(e.target.value)} style={{ marginTop: 6 }} />
          </details>
          <button onClick={reset} title="Demo only: wipes all app edits for every visitor">Reset demo data (demo only)</button>
        </div>
      </aside>
      <main className="main">
        <div className="top">
          <label title="Every screen shows only what was known on this date">As of <input type="date" value={asOf} min={SEASON_START} max={SEASON_END} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></label>
          <div className="quick">
            {QUICK.map(([l, d]) => <button key={d} className={asOf === d ? "on" : ""} onClick={() => setAsOf(d)}>{l}</button>)}
          </div>
          <div className="spacer" />
          <button className="btn primary" onClick={() => setChatOpen(true)}>Ask the Analyst</button>
        </div>
        <div className="page" key={current.id}>{current.el}</div>
      </main>
      <ChatPanel />
    </div>
  );
}

function Setup() {
  return (
    <div className="setup card">
      <h1>Connect Supabase</h1>
      <p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>), then restart. The SQL to run is in <code>supabase/sql/</code>, in order.</p>
    </div>
  );
}
