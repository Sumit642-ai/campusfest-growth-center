// Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... node run_tests.mjs [label]
// Expected numbers are computed live from the database, so the test still works after you edit data.
import { readFileSync, appendFileSync } from "node:fs";
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY;
const label = process.argv[2] ?? "run";
const key = JSON.parse(readFileSync(new globalThis.URL("./answer_key.json", import.meta.url)));
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function metric(e) {
  const r = await fetch(`${URL}/rest/v1/rpc/query_metric`, { method: "POST", headers: H,
    body: JSON.stringify({ metric: e.metric, as_of: e.as_of, filters: e.filters ?? {}, group_by: null }) });
  const rows = await r.json(); return Number(rows[0]?.value ?? 0);
}
// accepts 1505000, 15,05,000, 1,505,000, 15.05L, 15.05 lakh
function hasNumber(text, n, money) {
  const t = text.replace(/[,₹]/g, "");
  if (new RegExp(`(^|[^0-9.])${n}([^0-9]|$)`).test(t)) return true;
  if (money) { const l = n / 1e5; for (const d of [1, 2]) if (t.includes(l.toFixed(d) + "L") || t.includes(l.toFixed(d) + " L") || t.toLowerCase().includes(l.toFixed(d) + " lakh")) return true; }
  return false;
}
let pass = 0; const lines = [];
for (const c of key) {
  // "Busy" means Google's model was overloaded, not a wrong answer: retry up to 2 times.
  let out = {};
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${URL}/functions/v1/analyst`, { method: "POST", headers: H, body: JSON.stringify({ as_of: c.as_of, messages: [{ role: "user", text: c.q }] }) });
    out = await r.json().catch(() => ({ answer: "busy (no JSON)" }));
    if (!/busy/i.test(out.answer ?? "busy")) break;
    await new Promise((s) => setTimeout(s, 10000));
  } const text = out.answer ?? ""; const e = c.expect; let ok = true; let why = "";
  if (e.metric) { const n = await metric(e); ok = hasNumber(text, n, e.money); why = `expected ${n}`; }
  if (e.and_metric) { const n = await metric(e.and_metric); ok = ok && hasNumber(text, n); why += ` expected ${n}`; }
  if (e.contains_any) { ok = ok && e.contains_any.some((s) => text.toLowerCase().includes(s.toLowerCase())); why += ` needs one of ${e.contains_any}`; }
  if (e.contains_all) { ok = ok && e.contains_all.every((s) => text.includes(s)); why += ` needs all of ${e.contains_all}`; }
  if (e.refuse_like) { ok = ok && e.refuse_like.some((s) => text.toLowerCase().includes(s)); why += " should refuse or qualify"; }
  if (e.drafts_min) { ok = ok && (out.drafts?.length ?? 0) >= e.drafts_min; why += ` needs >= ${e.drafts_min} draft task`; }
  if (ok) pass++;
  lines.push(`${ok ? "PASS" : "FAIL"} | ${c.q} | ${ok ? "" : why + " | got: " + text.slice(0, 160).replace(/\n/g, " ")}`);
  console.log(lines.at(-1));
  await new Promise((s) => setTimeout(s, Number(process.env.GAP_MS ?? 4000))); // stay under rate limits
}
const summary = `${new Date().toISOString()} [${label}] ${pass}/${key.length} passed`;
console.log(summary); appendFileSync("test_log.md", `\n## ${summary}\n` + lines.map((l) => `- ${l}`).join("\n") + "\n");
