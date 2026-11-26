// Writes supabase/full_setup.sql: every setup file plus all CSV data, to paste into the Supabase SQL Editor in one go.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const parseCsv = (text) => { const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); } return rows; };
const lit = (v) => (v === "" ? "null" : `'${v.replace(/'/g, "''")}'`);
const files = readdirSync("supabase/sql").sort();
let out = "-- CampusFest Sponsor Growth Center: full setup (tables, data, views, functions, seed, security)\n\n";
out += readFileSync(`supabase/sql/${files[0]}`, "utf8") + "\n";
for (const f of readdirSync("data").filter((x) => x.endsWith(".csv")).sort()) {
  const t = f.replace(/\.csv$/, "");
  const [head, ...rows] = parseCsv(readFileSync(`data/${f}`, "utf8")).filter((r) => r.length > 1 || r[0] !== "");
  out += `\ninsert into ${t} (${head.join(",")}) values\n${rows.map((r) => `(${r.map(lit).join(",")})`).join(",\n")};\n`;
}
for (const f of files.slice(1)) out += `\n-- ${f}\n` + readFileSync(`supabase/sql/${f}`, "utf8") + "\n";
writeFileSync("supabase/full_setup.sql", out);
console.log("wrote supabase/full_setup.sql", out.length, "bytes");
