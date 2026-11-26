/** ₹22.4L, ₹1.12Cr, ₹93,333 (Indian grouping). */
export function inrShort(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${trim(n / 1e7, 2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${trim(n / 1e5, 2)}L`;
  return inr(n);
}
export function inr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function trim(x: number, d: number) {
  return x.toFixed(d).replace(/\.?0+$/, "");
}
export function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function addDays(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
}
export const STAGE_LABEL: Record<string, string> = {
  prospecting: "Prospecting", contacted: "Contacted", proposal_sent: "Proposal sent", negotiating: "Negotiating",
  partner_confirmed: "Confirmed", lost: "Lost", withdrawn: "Withdrawn",
};
export const STAGES = Object.keys(STAGE_LABEL);
