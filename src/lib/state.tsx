import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export const SEASON_START = "2025-01-15";
export const SEASON_END = "2025-04-20";

type Ctx = {
  asOf: string; setAsOf: (d: string) => void;
  clock: string; setClock: (d: string) => void;
  version: number; refresh: () => void;
  chatOpen: boolean; setChatOpen: (b: boolean) => void;
  chatSeed: { q: string; n: number } | null; ask: (q: string) => void;
};
const C = createContext<Ctx | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  const [asOf, setAsOf] = useState("2025-03-15"); // mid-season by default, so the dashboard shows a live campaign
  const [clock, setClockState] = useState(() => localStorage.getItem("campaign_clock") ?? SEASON_END);
  const [version, setVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<{ q: string; n: number } | null>(null);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setClock = (d: string) => { localStorage.setItem("campaign_clock", d); setClockState(d); };
  const ask = (q: string) => { setChatOpen(true); setChatSeed({ q, n: Date.now() }); };
  return <C.Provider value={{ asOf, setAsOf, clock, setClock, version, refresh, chatOpen, setChatOpen, chatSeed, ask }}>{children}</C.Provider>;
}
export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("useApp outside AppState");
  return c;
}
