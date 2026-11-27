import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export const SEASON_START = "2025-01-15";
export const SEASON_END = "2025-04-20";
export const FEST_EVE = "2025-04-11"; // the fest ran 12-13 Apr 2025; cash and deals after this no longer help the fest
export const FEST_START = "2025-04-12";
export const DEFAULT_ASOF = "2025-03-15";
/** True once the fest has started: targets can no longer be hit, so screens switch to a season-over view. */
export const seasonOver = (d: string) => d >= FEST_START;

type Toast = { id: number; text: string; undo?: () => Promise<void> | void; tone?: "ok" | "err" };
type ConfirmReq = { title: string; body?: ReactNode; ok: string; danger?: boolean; resolve: (b: boolean) => void };

type Ctx = {
  asOf: string; setAsOf: (d: string) => void;
  clock: string; setClock: (d: string) => void;
  version: number; refresh: () => void;
  chatOpen: boolean; setChatOpen: (b: boolean) => void;
  chatSeed: { q: string; n: number } | null; ask: (q: string) => void;
  toast: (text: string, undo?: Toast["undo"], tone?: Toast["tone"]) => void;
  confirm: (title: string, opts?: { body?: ReactNode; ok?: string; danger?: boolean }) => Promise<boolean>;
};
const C = createContext<Ctx | null>(null);

const validDate = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= SEASON_START && d <= SEASON_END ? d : null);
const clampClock = (d: string) => (d < SEASON_START ? SEASON_START : d > FEST_EVE ? FEST_EVE : d);

export function AppState({ children }: { children: ReactNode }) {
  // The as-of date lives in the URL (?asof=2025-03-15), so a shared link opens on the same date.
  const [asOf, setAsOfState] = useState(() => validDate(new URLSearchParams(location.search).get("asof")) ?? DEFAULT_ASOF);
  const [clock, setClockState] = useState(() => clampClock(localStorage.getItem("campaign_clock") ?? FEST_EVE));
  const [version, setVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<{ q: string; n: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const tid = useRef(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setClock = (d: string) => { const c = clampClock(d); localStorage.setItem("campaign_clock", c); setClockState(c); };
  const setAsOf = (d: string) => { const v = validDate(d); if (v) setAsOfState(v); };
  const ask = (q: string) => { setChatOpen(true); setChatSeed({ q, n: Date.now() }); };

  useEffect(() => {
    const u = new URL(location.href);
    u.searchParams.set("asof", asOf);
    history.replaceState(null, "", u.toString());
  }, [asOf]);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const toast: Ctx["toast"] = (text, undo, tone = "ok") => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, text, undo, tone }]);
    setTimeout(() => dismiss(id), undo ? 8000 : 4000);
  };
  const confirm: Ctx["confirm"] = (title, opts = {}) => new Promise((resolve) => setReq({ title, body: opts.body, ok: opts.ok ?? "OK", danger: opts.danger, resolve }));
  const close = (b: boolean) => { req?.resolve(b); setReq(null); };

  return (
    <C.Provider value={{ asOf, setAsOf, clock, setClock, version, refresh, chatOpen, setChatOpen, chatSeed, ask, toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "err" ? "err" : ""}`}>
            <span>{t.text}</span>
            {t.undo && <button onClick={async () => { dismiss(t.id); await t.undo!(); }}>Undo</button>}
            <button className="x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
      {req && (
        <>
          <div className="drawer-bg" style={{ zIndex: 40 }} onClick={() => close(false)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label={req.title}>
            <h2>{req.title}</h2>
            {req.body && <div className="modal-body">{req.body}</div>}
            <div className="inline" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn" onClick={() => close(false)}>Cancel</button>
              <button className={`btn ${req.danger ? "danger-solid" : "primary"}`} autoFocus onClick={() => close(true)}>{req.ok}</button>
            </div>
          </div>
        </>
      )}
    </C.Provider>
  );
}
export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("useApp outside AppState");
  return c;
}
