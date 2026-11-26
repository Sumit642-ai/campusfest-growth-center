import type { ReactNode } from "react";

export function Tile(p: { label: string; value: ReactNode; hint?: ReactNode; progress?: number; hero?: boolean; onExplain?: () => void; children?: ReactNode }) {
  return (
    <div className={`card tile ${p.hero ? "hero" : ""}`}>
      <div className="label">{p.label}</div>
      <div className="value">{p.value}</div>
      {p.hint && <div className="hint">{p.hint}</div>}
      {p.progress != null && <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, p.progress * 100))}%` }} /></div>}
      {p.children}
      {p.onExplain && <button className="explain" onClick={p.onExplain}>Explain →</button>}
    </div>
  );
}
export function Loading() { return <div className="muted">Loading…</div>; }
export function ErrorBox({ error }: { error: string }) { return <div className="err">Couldn't load data: {error}</div>; }
