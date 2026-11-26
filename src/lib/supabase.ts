import { createClient } from "@supabase/supabase-js";

// Public project settings (the anon key is meant to be public; Row Level Security controls access).
// Environment variables override them, so the same code can point at another Supabase project.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://mxcmtfubvokulmzkcmem.supabase.co";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Y210ZnVidm9rdWxtemtjbWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NTk1ODAsImV4cCI6MjExMTIzNTU4MH0.x95PAwXZlb2eEhT6JfrUmQKOxeJS8qcspPp5hpqfCug";
export const configured = Boolean(url && key);
export const sb = createClient(url ?? "http://localhost", key ?? "missing");

export type MetricRow = { grp: string; value: number; n: number };

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** One named metric as of a date (computed in the database by query_metric). */
export async function metric(name: string, asOf: string, filters: Record<string, string> = {}, groupBy: string | null = null) {
  const rows = await rpc<MetricRow[]>("query_metric", { metric: name, as_of: asOf, filters, group_by: groupBy });
  return rows.map((r) => ({ ...r, value: Number(r.value), n: Number(r.n) }));
}
export async function metricValue(name: string, asOf: string, filters: Record<string, string> = {}) {
  const rows = await metric(name, asOf, filters);
  return rows[0]?.value ?? 0;
}

export async function table<T = any>(name: string, order?: string): Promise<T[]> {
  let q = sb.from(name).select("*");
  if (order) q = q.order(order, { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function log(action: string, detail: Record<string, unknown>) {
  await sb.from("activity_log").insert({ actor: "app user", action, detail });
}

export type Opp = {
  opportunity_id: string; opportunity_name: string; brand_id: string; brand_name: string; stage: string;
  proposed_value_inr: number; confirmed_value_inr: number; owner_name: string; effective_at: string;
  support_type: string; originating_campaign_name: string; industry: string; days_in_stage: number;
};
export const OPEN = (s: string) => !["partner_confirmed", "lost", "withdrawn"].includes(s);
