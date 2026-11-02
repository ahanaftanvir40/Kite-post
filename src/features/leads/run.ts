import { hostOf } from "@/lib/leads/emails";
import type { EmailResult, Place } from "@/lib/leads/serper";
import type { LeadPlan } from "@/lib/leads/plan";
import { batchToXlsx } from "@/lib/spreadsheet/batches";

export interface LeadInput {
  description: string;
  productUrl: string;
  location: string;
  target: number;
}

export interface Lead {
  id: string;
  name: string;
  category: string;
  address: string;
  website: string | null;
  emails: string[];
  rating: number | null;
  ratingCount: number | null;
  query: string;
}

export type Phase = "planning" | "searching" | "emails" | "done";

export interface Progress {
  phase: Phase;
  plan: LeadPlan | null;
  leads: Lead[];
  /** Websites checked so far, and how many there are to check. */
  checked: number;
  toCheck: number;
}

const EMAIL_CHUNK = 6;
const MAX_PAGES = 5;

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The lead search failed.");
  return data;
}

/** Keep the first place per listing id and per website, so chains and repeats don't pad the sheet. */
export function addUnique(into: Lead[], places: Place[], query: string, limit: number): void {
  const ids = new Set(into.map((l) => l.id));
  const hosts = new Set(into.map((l) => (l.website ? hostOf(l.website) : null)).filter(Boolean));
  for (const p of places) {
    if (into.length >= limit) return;
    const host = p.website ? hostOf(p.website) : null;
    if (ids.has(p.cid) || (host && hosts.has(host))) continue;
    ids.add(p.cid);
    if (host) hosts.add(host);
    into.push({ id: p.cid, name: p.title, category: p.category, address: p.address, website: p.website, emails: [], rating: p.rating, ratingCount: p.ratingCount, query });
  }
}

/** Plan, search, then look for emails, reporting after every step. Stops quietly on abort. */
export async function runLeadSearch(input: LeadInput, signal: AbortSignal, onProgress: (p: Progress) => void): Promise<Progress> {
  const state: Progress = { phase: "planning", plan: null, leads: [], checked: 0, toCheck: 0 };
  const report = () => onProgress({ ...state, leads: [...state.leads] });
  report();

  state.plan = await post<LeadPlan>("/api/leads/plan", { description: input.description, productUrl: input.productUrl }, signal);
  state.phase = "searching";
  report();

  // Round-robin pages across queries until there are enough businesses or Google runs dry.
  const dry = new Set<string>();
  for (let page = 1; page <= MAX_PAGES && state.leads.length < input.target; page++) {
    for (const query of state.plan.queries) {
      if (state.leads.length >= input.target) break;
      if (dry.has(query)) continue;
      const { places } = await post<{ places: Place[] }>("/api/leads/search", { query, location: input.location, page }, signal);
      if (places.length === 0) dry.add(query);
      addUnique(state.leads, places, query, input.target);
      report();
    }
    if (dry.size === state.plan.queries.length) break;
  }

  const withSite = state.leads.filter((l) => l.website);
  state.phase = "emails";
  state.toCheck = withSite.length;
  report();
  for (let i = 0; i < withSite.length; i += EMAIL_CHUNK) {
    const chunk = withSite.slice(i, i + EMAIL_CHUNK);
    const { results } = await post<{ results: EmailResult[] }>("/api/leads/emails", { urls: chunk.map((l) => l.website) }, signal);
    chunk.forEach((lead, j) => {
      lead.emails = results[j]?.emails ?? [];
    });
    state.checked += chunk.length;
    report();
  }

  state.phase = "done";
  report();
  return state;
}

const HEADERS = ["Business", "Category", "Email", "Other emails", "Website", "Address", "Rating", "Reviews", "Search"];

export function leadsToXlsx(leads: Lead[]): Uint8Array {
  const rows = leads.map((l) => ({
    Business: l.name,
    Category: l.category,
    Email: l.emails[0] ?? "",
    "Other emails": l.emails.slice(1, 4).join(", "),
    Website: l.website ?? "",
    Address: l.address,
    Rating: l.rating === null ? "" : String(l.rating),
    Reviews: l.ratingCount === null ? "" : String(l.ratingCount),
    Search: l.query,
  }));
  return batchToXlsx(HEADERS, rows, "Leads");
}
