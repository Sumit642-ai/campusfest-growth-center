// Monte Carlo of next season's confirmed value and cash. TypeScript port of analysis/simulation.py.
export type SimInput = {
  renewalRate: number; warmBrands: number; warmClose: number; avgDeal: number; collection: number;
  bets: { on: boolean; chance: number }[]; // 5 bets in blueprint order
  runs?: number;
};
export type SimOutput = { value: [number, number, number]; cash: [number, number, number]; pAbove: (x: number) => number };

const rnd = Math.random;
function binom(n: number, p: number) { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; }
function normal(mu: number, sd: number) { const u = 1 - rnd(), v = rnd(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function pct(sorted: number[], p: number) { return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]; }

export function simulate(x: SimInput): SimOutput {
  const N = x.runs ?? 5000, val: number[] = [], cash: number[] = [];
  const works = (i: number) => x.bets[i].on && rnd() < x.bets[i].chance;
  const anyBet = x.bets.some((b) => b.on);
  for (let r = 0; r < N; r++) {
    let tot = 0;
    const b1 = works(0); // Proof Pack: +15 points renewal, 20% bigger package (vs 5% price rise)
    tot += binom(24, b1 ? Math.min(1, x.renewalRate + 0.15) : x.renewalRate) * x.avgDeal * (b1 ? 1.2 : 1.05) * normal(1, 0.15);
    const b2 = works(1); // warm engine: +15 warm brands
    tot += binom(x.warmBrands + (b2 ? 15 : 0), x.warmClose) * x.avgDeal * normal(1, 0.15);
    if (works(2)) tot += binom(26, 0.2) * 70000; // zombie rescue
    if (works(3)) tot += binom(6, 0.67) * 150000; // co-funded attendee campaigns
    if (works(4)) tot += binom(3, 0.9) * 148000 - 50000; // category auction: premium in 3 categories minus ₹50k lost from brands turned away
    val.push(tot);
    const c = Math.min(1, x.collection + (rnd() - 0.5) * 0.15);
    cash.push(tot * (anyBet ? 0.92 : 0.89) * c);
  }
  val.sort((a, b) => a - b); cash.sort((a, b) => a - b);
  return {
    value: [pct(val, 10), pct(val, 50), pct(val, 90)],
    cash: [pct(cash, 10), pct(cash, 50), pct(cash, 90)],
    pAbove: (t) => val.filter((v) => v >= t).length / N,
  };
}
