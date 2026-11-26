// Supabase Edge Function: supabase/functions/analyst/index.ts
// Secrets to set: GEMINI_API_KEY (and optionally GEMINI_MODEL). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import { answer, type Deps, type Msg } from "./core.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MODELS = (Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash,gemini-flash-latest,gemini-3.1-flash-lite").split(",").map((m) => m.trim());
const KEY = Deno.env.get("GEMINI_API_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

let lastError: unknown = null;
let requestStart = Date.now();
const deps: Deps = {
  rpc: async (fn, args) => { const { data, error } = await sb.rpc(fn, args); return { data, error }; },
  select: async (table) => { const { data, error } = await sb.from(table).select("*").limit(500); return { data, error }; },
  gemini: async (body) => {
    // Try each model in turn; free-tier models sometimes return 503 (busy), 429 (rate limit) or hang.
    for (let attempt = 0; attempt < MODELS.length * 2; attempt++) {
      if (Date.now() - requestStart > 110000) break; // stay inside the 150s function limit
      const model = MODELS[attempt % MODELS.length];
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal,
        });
        if (r.status === 429 || r.status >= 500) {
          lastError = { model, status: r.status, body: (await r.text()).slice(0, 300) };
          if (attempt >= MODELS.length - 1) await new Promise((ok) => setTimeout(ok, 1500));
          continue;
        }
        return await r.json();
      } catch (_e) {
        lastError = { model, status: 0, body: "timeout" };
      } finally { clearTimeout(timer); }
    }
    return { error: lastError };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    requestStart = Date.now();
    const body = await req.json();
    const { messages, as_of } = body as { messages: Msg[]; as_of: string };
    const result = await answer(messages.slice(-12), as_of ?? "2025-04-20", deps);
    return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ answer: `Something went wrong: ${(e as Error).message}`, drafts: [], trace: [] }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
