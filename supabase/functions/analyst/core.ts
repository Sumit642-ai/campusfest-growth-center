// Ask the Analyst: core logic. Works in a Supabase Edge Function (Deno) and in tests (Bun/Node).
// The model never does arithmetic: every number comes from a database function.

export type Msg = { role: "user" | "model"; text: string };
export type Change = { campaign_id: number; campaign: string; field: "status" | "budget_inr"; from: unknown; to: unknown; reason: string };
export type Draft = { title: string; owner: string; due_date: string; opportunity_id?: string; bet_id?: number; reason: string };
export type Deps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  select: (table: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  gemini: (body: unknown) => Promise<any>;
  deadline?: () => number; // time (ms) after which we stop calling the model and answer from what we have
};

export const SYSTEM = `You are "Ask the Analyst", the growth analyst inside a college-festival Sponsor Growth Center.
Data: CampusFest 2025 sponsor acquisition records (15 Jan to 20 Apr 2025), plus app data (tasks, bets, thresholds, payments, assumptions, and next season's campaign plan with owners, dates, budgets, status, targets and spend).
Rules:
1. Never do arithmetic yourself. Get every number from a tool. If you need a ratio, call tools for both parts and say "calculated as A / B".
2. Always pass an as_of date (YYYY-MM-DD). If the user gives none, use the as-of date from the app (given below). Never use information dated after it.
3. Keep populations separate: outreach attempts are not brands; positive replies are not qualified brands; qualified brands are not confirmed partnerships.
4. Confirmed value is reported value, not cash. Cash paid only comes from the payments table (app data). The source data has no bank receipts. Payment rows whose note starts with 'demo seed' are demo data (assumed terms: 50% within 7 days of signing, 50% by 1 Apr); always say that cash figures come from this demo payments log, not from the 2025 source.
5. Sponsor activations are associations. Never claim they caused extra visitors.
6. If no tool or field can answer, start the answer with "The data doesn't track this." and say what is missing, then offer the closest metric that does exist. Never estimate a missing number.
7. To suggest an action, call propose_task. To suggest moving budget or pausing/stopping/activating a campaign in next season's plan, call propose_campaign_change (one call per campaign and field; to move budget, call it twice: one cut, one increase). You cannot create tasks yourself; the user confirms in the app. After calling propose_task, still write the full answer in the format below, and mention the draft under Next step.
7a. The 2025 source has NO cost, spend or budget data. Any 2025 cost question (cost per deal, cost per lead, CAC, spend by campaign, ROI) must start with "The data doesn't track this." Then give the closest real metric (for example outreach attempts per confirmed deal) and say budgets exist only for next season's plan. Answer the rest of a mixed question normally.
7b. Budget and spend questions: use v_campaign_budget (per campaign) and v_campaign_budget_totals (totals). Never add up rows yourself.
7c. Write for a sponsorship lead, not an engineer. In the answer text never mention tool, function, table, view or column names (no query_metric, src_opportunities, v_campaign_budget, stage codes like partner_confirmed), not even under Source; write money with ₹ and the full figure first, e.g. "₹7,07,500 (₹7.1L)" or "₹93,333" and never write ISO dates: write dates like "15 Mar 2025" and stages like "Confirmed". The app shows the technical detail separately under "Show working".
8. Answer format (markdown):
**Answer:** one or two sentences, with the as-of date.
**Evidence:** the numbers and, in plain words, which records they came from (e.g. "confirmed deals from warm campaigns up to 15 Mar 2025").
**Calculation:** one line, if any.
**Source / app data / assumption:** tag each number.
**Confidence:** high, medium or low, with the reason (e.g. small sample).
**Next step:** always one concrete action tied to the evidence: who does what, by when, and which metric or threshold to watch (e.g. "Riya: send Proof Packs to the 18 test partners this week; watch meetings booked in 7 days"). Never write "None". If the data cannot answer, the next step is how to get the missing data.`;

const S = (description: string) => ({ type: "string", description });
export const TOOLS = [{
  functionDeclarations: [
    { name: "query_metric", description: "Compute a named metric as of a date, optionally filtered and grouped. Metrics: confirmed_partnerships, confirmed_value, avg_confirmed_deal, opportunities, open_opportunities, open_pipeline_value, stuck_opportunities, qualified_brands, assessed_brands, brands_touched, outreach_attempts, replied_brands, positive_reply_events, meetings_held_brands, opt_out_events, first_contacts (outreach sent + introductions received + web inbound: one per contact made; use this for 'touches' or effort per deal), touches (EVERY logged event incl. deliveries, replies and meetings; only use when asked for all events). Stages are prospecting, contacted, proposal_sent, negotiating, partner_confirmed (= confirmed / won), lost, withdrawn. Support types are cash, in_kind. Opportunity metrics can filter/group by stage, owner_name, industry, support_type, originating_campaign_name, brand_name. Qualification metrics by qualification_status, source_campaign_name. Interaction metrics by campaign_name, channel, event_type, outcome, owner_id.",
      parameters: { type: "object", properties: { metric: S("metric name"), as_of: S("YYYY-MM-DD"), filters_json: S('JSON object of column: value, e.g. {"industry":"Mobility"}. Use "{}" for none.'), group_by: S("optional column to group by") }, required: ["metric", "as_of"] } },
    { name: "list_opportunities", description: "List opportunities with their latest stage as of a date (brand, stage, values, owner, industry, support type, campaign, days in stage).",
      parameters: { type: "object", properties: { as_of: S("YYYY-MM-DD"), stage: S("optional: prospecting, contacted, proposal_sent, negotiating, partner_confirmed, lost or withdrawn"), owner_name: S("optional"), industry: S("optional"), min_days_in_stage: { type: "number", description: "optional; returns only OPEN deals idle at least this many days" } }, required: ["as_of"] } },
    { name: "get_opportunity_history", description: "Full stage history of one opportunity up to a date.",
      parameters: { type: "object", properties: { opportunity_id: S("e.g. O004"), as_of: S("YYYY-MM-DD") }, required: ["opportunity_id", "as_of"] } },
    { name: "get_target", description: "The target version in force on a date.", parameters: { type: "object", properties: { as_of: S("YYYY-MM-DD") }, required: ["as_of"] } },
    { name: "evaluate_bets", description: "Each growth bet with its latest metric reading and the scale/change/stop call from its thresholds.", parameters: { type: "object", properties: {} } },
    { name: "get_app_table", description: "Read an app table: tasks, payments, assumptions, bets, thresholds, campaign_plan (next season's campaigns: owner, dates, status, budget, targets, the 2025 campaign it builds on), campaign_spend (spend log), v_campaign_budget (per campaign: budget, spent, remaining, % spent, target deals and value, planned cost per deal), v_campaign_budget_totals (one row: live campaigns, total budget, spent, remaining, campaigns over budget, target deals and value). Budgets and spend exist only for next season's plan; the 2025 source has no spend data.", parameters: { type: "object", properties: { table: S("one of tasks, payments, assumptions, bets, thresholds, campaign_plan, campaign_spend, v_campaign_budget, v_campaign_budget_totals") }, required: ["table"] } },
    { name: "run_sql", description: "Last resort for questions other tools cannot answer. One read-only SELECT that reads only opp_snapshot(date), qual_snapshot(date), interactions_asof(date), target_in_force(date), query_metric(...), src_brands, src_contacts, src_campaigns, src_opportunities, src_activations or app tables (incl. campaign_plan, campaign_spend, v_campaign_budget). Always pass the as-of date into the snapshot functions.",
      parameters: { type: "object", properties: { query: S("the SELECT statement") }, required: ["query"] } },
    { name: "propose_campaign_change", description: "Draft a change to next season's campaign plan (status or budget) for the user to confirm in the app. Does not save anything. Read v_campaign_budget first to get the campaign id and current values.",
      parameters: { type: "object", properties: { campaign_id: { type: "number", description: "id from campaign_plan / v_campaign_budget" }, field: S("status or budget_inr"), new_value: S("for status: planned, active, paused, stopped or done; for budget_inr: the new budget in rupees"), reason: S("why, citing data") }, required: ["campaign_id", "field", "new_value", "reason"] } },
    { name: "propose_task", description: "Draft a task for the user to confirm in the app. Does not save anything.",
      parameters: { type: "object", properties: { title: S("task"), owner: S("person"), due_date: S("YYYY-MM-DD"), opportunity_id: S("optional"), reason: S("why, citing data") }, required: ["title", "owner", "due_date", "reason"] } },
  ],
}];

const APP_TABLES = ["tasks", "payments", "assumptions", "bets", "thresholds", "campaign_plan", "campaign_spend", "v_campaign_budget", "v_campaign_budget_totals"];

async function runTool(name: string, a: any, d: Deps, drafts: Draft[], changes: Change[]): Promise<unknown> {
  const out = (r: { data: unknown; error: { message: string } | null }) => (r.error ? { error: r.error.message } : { rows: r.data });
  switch (name) {
    case "query_metric": {
      let filters = {};
      try { filters = JSON.parse(a.filters_json || "{}"); } catch { return { error: "filters_json is not valid JSON" }; }
      const r = await d.rpc("query_metric", { metric: a.metric, as_of: a.as_of, filters, group_by: a.group_by || null });
      if (r.error) return { error: r.error.message };
      // Return only group and value: the row count "n" (rows scanned) was being misread as the answer.
      return { metric: a.metric, as_of: a.as_of, rows: ((r.data as any[]) ?? []).map((x) => ({ group: x.grp, value: x.value })) };
    }
    case "list_opportunities": {
      const r = await d.rpc("opp_snapshot", { d: a.as_of });
      if (r.error) return { error: r.error.message };
      let rows = (r.data as any[]) ?? [];
      if (a.stage) rows = rows.filter((x) => x.stage === a.stage);
      if (a.owner_name) rows = rows.filter((x) => x.owner_name === a.owner_name);
      if (a.industry) rows = rows.filter((x) => x.industry === a.industry);
      if (a.min_days_in_stage != null) rows = rows.filter((x) => !["partner_confirmed", "lost", "withdrawn"].includes(x.stage) && x.days_in_stage >= a.min_days_in_stage);
      return { count: rows.length, rows: rows.slice(0, 60) };
    }
    case "get_opportunity_history":
      return await historyOf(a, d);
    case "get_target":
      return out(await d.rpc("target_in_force", { d: a.as_of }));
    case "evaluate_bets":
      return await evaluateBets(d);
    case "get_app_table":
      if (!APP_TABLES.includes(a.table)) return { error: `Allowed tables: ${APP_TABLES.join(", ")}` };
      return out(await d.select(a.table));
    case "run_sql":
      return out(await d.rpc("run_readonly", { q: a.query }));
    case "propose_campaign_change": {
      const r = await d.select("campaign_plan");
      if (r.error) return { error: r.error.message };
      const c = ((r.data as any[]) ?? []).find((x) => Number(x.id) === Number(a.campaign_id));
      if (!c) return { error: `No campaign with id ${a.campaign_id}. Read v_campaign_budget for ids.` };
      if (a.field === "status") {
        const v = String(a.new_value).toLowerCase().trim();
        if (!["planned", "active", "paused", "stopped", "done"].includes(v)) return { error: "status must be planned, active, paused, stopped or done" };
        changes.push({ campaign_id: c.id, campaign: c.name, field: "status", from: c.status, to: v, reason: a.reason });
      } else if (a.field === "budget_inr") {
        const v = Number(String(a.new_value).replace(/[^0-9.]/g, ""));
        if (!isFinite(v) || v < 0) return { error: "budget_inr must be a number of rupees, 0 or more" };
        changes.push({ campaign_id: c.id, campaign: c.name, field: "budget_inr", from: Number(c.budget_inr), to: v, reason: a.reason });
      } else return { error: "field must be status or budget_inr" };
      return { ok: true, note: "Draft change shown to the user with Confirm / Cancel. Not saved yet." };
    }
    case "propose_task":
      drafts.push({ title: a.title, owner: a.owner, due_date: a.due_date, opportunity_id: a.opportunity_id, reason: a.reason });
      return { ok: true, note: "Draft shown to the user with Confirm / Edit / Cancel. Not saved yet." };
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function historyOf(a: any, d: Deps) {
  const day = String(a.as_of).replace(/[^0-9-]/g, "");
  const id = String(a.opportunity_id).replace(/[^A-Za-z0-9-]/g, "");
  // v_opp_history is blocked in run_readonly on purpose, so use a dedicated RPC.
  const r = await d.rpc("opp_history_asof", { opp: id, d: day });
  return r.error ? { error: r.error.message } : { rows: r.data };
}

async function evaluateBets(d: Deps) {
  const [b, t, m] = await Promise.all([d.select("bets"), d.select("thresholds"), d.select("bet_metrics")]);
  if (b.error || t.error || m.error) return { error: (b.error ?? t.error ?? m.error)!.message };
  return (b.data as any[]).map((bet) => {
    const th = (t.data as any[]).find((x) => x.bet_id === bet.id);
    const all = (m.data as any[]).filter((x) => x.bet_id === bet.id).sort((x, y) => String(y.measured_on).localeCompare(String(x.measured_on)) || y.id - x.id);
    // Demo readings illustrate the badge only; they never decide scale/change/stop.
    const isDemo = (x: any) => x.created_by === "seed" || /demo/i.test(x.note ?? "");
    const readings = all.filter((x) => !isDemo(x));
    const last = readings[0];
    const demo = all.find(isDemo) ?? null;
    let call = "no threshold set";
    if (th && !last) call = "no real data yet (the bets run in Jan-Mar 2027)";
    else if (th && last && last.sample < th.min_sample) call = `not enough data (${last.sample} of ${th.min_sample})`;
    else if (th && last) call = last.value >= th.scale_if ? "SCALE" : last.value <= th.stop_if ? "STOP" : "CHANGE";
    return { bet: bet.name, owner: bet.owner, runs: `${bet.start_date} to ${bet.end_date}`, metric: th?.metric, latest: last ?? null, demo_reading_not_used: demo, scale_if: th?.scale_if, stop_if: th?.stop_if, min_sample: th?.min_sample, call };
  });
}

export async function answer(history: Msg[], asOf: string, d: Deps) {
  const contents: any[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const drafts: Draft[] = [];
  const changes: Change[] = [];
  const trace: { tool: string; args: unknown; result: unknown; ms?: number }[] = [];
  const t0 = Date.now();
  let nudged = false;
  for (let step = 0; step < 8; step++) {
    const deadline = d.deadline ? d.deadline() : t0 + 55000;
    if (Date.now() > deadline - 3000) return { answer: fallback(trace, drafts, changes), drafts, changes, trace, fallback: true };
    const tg = Date.now();
    const res = await d.gemini({
      systemInstruction: { parts: [{ text: `${SYSTEM}\nThe app's current as-of date is ${asOf}.` }] },
      contents,
      tools: TOOLS,
      generationConfig: { temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } },
    });
    trace.push({ tool: "(model)", args: { step }, result: res?.error ?? res?.usageMetadata ?? null, ms: Date.now() - tg });
    const content = res?.candidates?.[0]?.content;
    if (!content) return { answer: fallback(trace, drafts, changes), drafts, changes, trace, fallback: true };
    contents.push(content); // keep the model's parts exactly (includes any thought signatures)
    const calls = (content.parts ?? []).filter((p: any) => p.functionCall);
    if (calls.length === 0) {
      const text = (content.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
      // Gemini sometimes stops after a tool call with no text: ask once more for the written answer.
      if ((!text || (drafts.length + changes.length > 0 && text.length < 200)) && !nudged) { nudged = true; contents.push({ role: "user", parts: [{ text: "Now write the full answer in the required format, using the tool results above." }] }); continue; }
      return { answer: text || "I read the data but couldn't write the answer this time. Please ask again.", drafts, changes, trace };
    }
    const responses = [];
    for (const p of calls) {
      const { name, args } = p.functionCall;
      const tt = Date.now();
      const result = await runTool(name, args ?? {}, d, drafts, changes);
      trace.push({ tool: name, args, result, ms: Date.now() - tt });
      responses.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { answer: "I couldn't finish this analysis in a few steps. Try a narrower question.", drafts, changes, trace };
}

const LABEL: Record<string, string> = {
  query_metric: "Metric", list_opportunities: "Deals", get_opportunity_history: "Deal history", get_target: "Target",
  evaluate_bets: "Bets", get_app_table: "App data", run_sql: "Query", propose_task: "Draft task", propose_campaign_change: "Draft change",
};
/** When the model is too slow or busy, answer from the numbers already read, so the user is never left waiting. No guessing. */
export function fallback(trace: { tool: string; args: unknown; result: unknown }[], drafts: Draft[], changes: Change[]) {
  const reads = trace.filter((t) => t.tool !== "(model)" && !String(t.tool).startsWith("propose"));
  if (!reads.length && !drafts.length && !changes.length)
    return "**Answer:** The AI model (free Google Gemini) is busy right now, so I couldn't start this analysis. Nothing was guessed.\n\n**Next step:** ask again in about 20 seconds, or use the dashboard tiles, which don't need the AI.";
  const lines = reads.slice(0, 6).map((t) => {
    const a = (t.args ?? {}) as Record<string, unknown>;
    const what = [LABEL[t.tool] ?? "Data", a.metric, a.group_by ? `by ${a.group_by}` : "", a.as_of ? `as of ${a.as_of}` : ""].filter(Boolean).join(" ");
    return `- **${what}:** ${summarise(t.result)}`;
  });
  return [
    "**Answer:** The AI model is slow right now, so here are the figures I already read from the live database, without an AI write-up. Nothing below is estimated.",
    "", ...lines, "",
    drafts.length || changes.length ? "I also drafted the suggestion below from this data; it is only saved if you confirm it.\n" : "",
    "**Next step:** ask again for the full explanation, or narrow the question (one metric at a time is fastest).",
  ].join("\n");
}
function summarise(r: unknown): string {
  if (r == null) return "no result";
  if (typeof r === "object" && !Array.isArray(r) && (r as any).error) return `could not read (${String((r as any).error).slice(0, 80)})`;
  const rows = Array.isArray(r) ? r : Array.isArray((r as any)?.rows) ? (r as any).rows : null;
  if (!rows) return JSON.stringify(r).slice(0, 160);
  if (!rows.length) return "no rows";
  if ("grp" in rows[0] && "value" in rows[0]) return rows.slice(0, 8).map((x: any) => `${x.grp ?? "total"} ${x.value}`).join(", ") + (rows.length > 8 ? ` and ${rows.length - 8} more` : "");
  const keys = Object.keys(rows[0]).slice(0, 4);
  return `${rows.length} rows, e.g. ` + rows.slice(0, 3).map((x: any) => keys.map((k) => `${k} ${x[k]}`).join(" / ")).join("; ");
}
