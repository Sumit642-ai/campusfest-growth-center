// Ask the Analyst: core logic. Works in a Supabase Edge Function (Deno) and in tests (Bun/Node).
// The model never does arithmetic: every number comes from a database function.

export type Msg = { role: "user" | "model"; text: string };
export type Change = { campaign_id: number; campaign: string; field: "status" | "budget_inr"; from: unknown; to: unknown; reason: string };
export type Draft = { title: string; owner: string; due_date: string; opportunity_id?: string; bet_id?: number; reason: string };
export type Deps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  select: (table: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  gemini: (body: unknown) => Promise<any>;
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
7b. Budget and spend questions: use v_campaign_budget (per campaign) and v_campaign_budget_totals (totals). Never add up rows yourself.
8. Answer format (markdown):
**Answer:** one or two sentences, with the as-of date.
**Evidence:** the numbers and which records (tool + filters) they came from.
**Calculation:** one line, if any.
**Source / app data / assumption:** tag each number.
**Confidence:** high, medium or low, with the reason (e.g. small sample).
**Next step:** always one concrete action tied to the evidence: who does what, by when, and which metric or threshold to watch (e.g. "Riya: send Proof Packs to the 18 test partners this week; watch meetings booked in 7 days"). Never write "None". If the data cannot answer, the next step is how to get the missing data.`;

const S = (description: string) => ({ type: "string", description });
export const TOOLS = [{
  functionDeclarations: [
    { name: "query_metric", description: "Compute a named metric as of a date, optionally filtered and grouped. Metrics: confirmed_partnerships, confirmed_value, avg_confirmed_deal, opportunities, open_opportunities, open_pipeline_value, stuck_opportunities, qualified_brands, assessed_brands, brands_touched, outreach_attempts, replied_brands, positive_reply_events, meetings_held_brands, opt_out_events, touches. Stages are prospecting, contacted, proposal_sent, negotiating, partner_confirmed (= confirmed / won), lost, withdrawn. Support types are cash, in_kind. Opportunity metrics can filter/group by stage, owner_name, industry, support_type, originating_campaign_name, brand_name. Qualification metrics by qualification_status, source_campaign_name. Interaction metrics by campaign_name, channel, event_type, outcome, owner_id.",
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
    const readings = (m.data as any[]).filter((x) => x.bet_id === bet.id).sort((x, y) => String(y.measured_on).localeCompare(String(x.measured_on)) || y.id - x.id);
    const last = readings[0];
    let call = "no threshold set";
    if (th && !last) call = "no data yet";
    else if (th && last && last.sample < th.min_sample) call = `not enough data (${last.sample} of ${th.min_sample})`;
    else if (th && last) call = last.value >= th.scale_if ? "SCALE" : last.value <= th.stop_if ? "STOP" : "CHANGE";
    return { bet: bet.name, metric: th?.metric, latest: last ?? null, scale_if: th?.scale_if, stop_if: th?.stop_if, min_sample: th?.min_sample, call };
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
    if (Date.now() - t0 > 100000) return { answer: drafts.length || changes.length ? "The AI service is slow right now, so I stopped before writing the full answer. I did draft the suggestion below from the data; the Show working panel lists every number I read. Ask again for the full write-up." : "This question needed more steps than I can run in one go (the AI service is slow right now). Try again, or ask a narrower question.", drafts, changes, trace };
    const tg = Date.now();
    const res = await d.gemini({
      systemInstruction: { parts: [{ text: `${SYSTEM}\nThe app's current as-of date is ${asOf}.` }] },
      contents,
      tools: TOOLS,
      generationConfig: { temperature: 0.1, thinkingConfig: { thinkingLevel: "low" } },
    });
    trace.push({ tool: "(model)", args: { step }, result: res?.error ?? res?.usageMetadata ?? null, ms: Date.now() - tg });
    const content = res?.candidates?.[0]?.content;
    if (!content) return { answer: "The AI service (Google Gemini) is busy right now. Please try again in a few seconds.", drafts, changes, trace };
    contents.push(content); // keep the model's parts exactly (includes any thought signatures)
    const calls = (content.parts ?? []).filter((p: any) => p.functionCall);
    if (calls.length === 0) {
      const text = (content.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
      // Gemini sometimes stops after a tool call with no text: ask once more for the written answer.
      if (!text && !nudged) { nudged = true; contents.push({ role: "user", parts: [{ text: "Now write the full answer in the required format, using the tool results above." }] }); continue; }
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
