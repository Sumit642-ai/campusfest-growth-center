import { useEffect, useState } from "react";
import { configured, rpc } from "./lib/supabase";
import { SEASON_END, SEASON_START, useApp } from "./lib/state";
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
  const { asOf, setAsOf, clock, setClock, setChatOpen, refresh } = useApp();
  if (!configured) return <Setup />;
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0];

  async function reset() {
    if (!window.confirm("Remove every edit, payment, task and reading added in the app? Source data stays untouched.")) return;
    await rpc("reset_demo", {});
    refresh();
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Sponsor Growth Center<span>CampusFest · sponsorship</span></div>
        {PAGES.map((p) => <a key={p.id} href={`#${p.id}`} className={`nav ${p.id === current.id ? "on" : ""}`}>{p.label}</a>)}
        <div className="side-foot">
          <div>
            <div style={{ marginBottom: 4 }}>Campaign clock</div>
            <input type="date" value={clock} min={SEASON_START} max={SEASON_END} onChange={(e) => e.target.value && setClock(e.target.value)} />
            <div style={{ marginTop: 4 }}>New edits are stamped on this date (23:00 IST), so they show up in the 2025 data.</div>
          </div>
          <button onClick={reset}>Reset demo data</button>
        </div>
      </aside>
      <main className="main">
        <div className="top">
          <label>As of <input type="date" value={asOf} min={SEASON_START} max={SEASON_END} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></label>
          <div className="quick">
            {QUICK.map(([l, d]) => <button key={d} className={asOf === d ? "on" : ""} onClick={() => setAsOf(d)}>{l}</button>)}
          </div>
          <span className="chip-clock">Campaign clock: {fmtDate(clock)}</span>
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
