// One-shot Supabase setup through the Management API (no database password needed).
// Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/setup_supabase.mjs <project-ref> [step]
// Steps: sql (tables, views, functions, seed), data (load CSVs), function (deploy analyst), keys (print URL + anon key), all (default)
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.argv[2];
const STEP = process.argv[3] ?? "all";
if (!TOKEN || !REF) { console.error("Need SUPABASE_ACCESS_TOKEN and a project ref"); process.exit(1); }
const API = `https://api.supabase.com/v1/projects/${REF}`;
const H = { Authorization: `Bearer ${TOKEN}` };

async function sql(query) {
  const r = await fetch(`${API}/database/query`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${text.slice(0, 500)}`);
  return JSON.parse(text || "[]");
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const lit = (v) => (v === "" ? "null" : `'${v.replace(/'/g, "''")}'`);

async function stepSql() {
  for (const f of readdirSync(join(root, "supabase/sql")).sort()) {
    console.log(`running ${f}`);
    await sql(readFileSync(join(root, "supabase/sql", f), "utf8"));
  }
}

async function stepData() {
  for (const f of readdirSync(join(root, "data")).filter((x) => x.endsWith(".csv")).sort()) {
    const t = f.replace(/\.csv$/, "");
    const [head, ...rows] = parseCsv(readFileSync(join(root, "data", f), "utf8")).filter((r) => r.length > 1 || r[0] !== "");
    await sql(`truncate ${t}`);
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250).map((r) => `(${r.map(lit).join(",")})`).join(",\n");
      await sql(`insert into ${t} (${head.join(",")}) values ${chunk}`);
    }
    const [{ n }] = await sql(`select count(*)::int as n from ${t}`);
    console.log(`${t}: ${n} rows`);
  }
  const checks = await sql(`select
    (select count(*) from v_interactions)::int as interactions,
    (select count(*) filter (where qualification_status='qualified') from qual_snapshot('2025-03-15'))::int as qualified_15mar,
    (select count(*) from opp_snapshot('2025-03-15') where stage='partner_confirmed')::int as confirmed_15mar,
    (select sum(confirmed_value_inr) from opp_snapshot('2025-04-11') where stage='partner_confirmed')::int as value_11apr`);
  console.log("checks (expect 950, 55, 17, 2240000):", checks[0]);
}

async function stepFunction() {
  const form = new FormData();
  form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "analyst", verify_jwt: false }));
  for (const f of ["index.ts", "core.ts"]) form.append("file", new Blob([readFileSync(join(root, "supabase/functions/analyst", f))]), f);
  const r = await fetch(`${API}/functions/deploy?slug=analyst`, { method: "POST", headers: H, body: form });
  console.log("deploy analyst:", r.status, (await r.text()).slice(0, 300));
}

async function stepKeys() {
  const r = await fetch(`${API}/api-keys`, { headers: H });
  const keys = await r.json();
  const anon = keys.find?.((k) => k.name === "anon")?.api_key;
  console.log(`VITE_SUPABASE_URL=https://${REF}.supabase.co`);
  console.log(`VITE_SUPABASE_ANON_KEY=${anon ?? "(not found)"}`);
}

const steps = { sql: stepSql, data: stepData, function: stepFunction, keys: stepKeys };
for (const s of STEP === "all" ? Object.keys(steps) : [STEP]) await steps[s]();
