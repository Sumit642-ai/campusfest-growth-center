// Supabase Edge Function: supabase/functions/analyst/index.ts
// Secrets to set: GEMINI_API_KEY (and optionally GEMINI_MODEL). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import { answer, type Deps, type Msg } from "./core.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// Fastest free models first. Each call gets 15 s; the whole answer gets about 50 s of model time, then core.ts falls back
// to a plain summary of the numbers it already read, so the user never waits more than about a minute.
const MODELS = (Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash-lite,gemini-flash-latest,gemini-3.5-flash").split(",").map((m) => m.trim());
const KEY = Deno.env.get("GEMINI_API_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const MODEL_BUDGET_MS = 50000;
const url = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`;

let attempts: { model: string; status: number; ms: number }[] = [];
let requestStart = Date.now();
const deps: Deps = {
  rpc: async (fn, args) => { const { data, error } = await sb.rpc(fn, args); return { data, error }; },
  select: async (table) => { const { data, error } = await sb.from(table).select("*").limit(500); return { data, error }; },
  deadline: () => requestStart + MODEL_BUDGET_MS,
  gemini: async (body: any) => {
    // Try each model in turn; free-tier models sometimes return 503 (busy), 429 (rate limit) or hang.
    for (let attempt = 0; attempt < MODELS.length * 4; attempt++) {
      const left = requestStart + MODEL_BUDGET_MS - Date.now();
      if (left < 3000) break;
      const model = MODELS[attempt % MODELS.length];
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), Math.min(15000, left));
      const t = Date.now();
      try {
        let r = await fetch(url(model), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
        if (r.status === 400 && body?.generationConfig?.thinkingConfig) {
          // Some models reject the thinking setting: retry the same model without it.
          await r.text();
          const { thinkingConfig: _t, ...gc } = body.generationConfig;
          r = await fetch(url(model), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, generationConfig: gc }), signal: ctl.signal });
        }
        attempts.push({ model, status: r.status, ms: Date.now() - t });
        if (r.status === 429 || r.status >= 500 || r.status === 404) {
          await r.text();
          // After each full round of models, wait a little longer before the next round.
          if ((attempt + 1) % MODELS.length === 0) await new Promise((ok) => setTimeout(ok, 1500 * ((attempt + 1) / MODELS.length)));
          continue;
        }
        return await r.json();
      } catch (_e) {
        attempts.push({ model, status: 0, ms: Date.now() - t });
      } finally { clearTimeout(timer); }
    }
    return { error: { attempts: attempts.slice(-6) } };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    requestStart = Date.now(); attempts = [];
    const body = await req.json();
    const { messages, as_of } = body as { messages: Msg[]; as_of: string };
    const result = await answer(messages.slice(-12), as_of ?? "2025-04-20", deps);
    return new Response(JSON.stringify({ ...result, models: attempts }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ answer: `Something went wrong: ${(e as Error).message}`, drafts: [], trace: [] }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
