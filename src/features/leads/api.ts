export interface LeadQuota {
  /** Searches left. Null means no limit. */
  remaining: number | null;
  limit: number;
}

/** The account has used all its free searches. Not a failure to report, a prompt to show. */
export class QuotaExhaustedError extends Error {
  constructor() {
    super("You have used your free lead searches.");
    this.name = "QuotaExhaustedError";
  }
}

const RUN_HEADER = "x-lead-run";

async function readError(response: Response): Promise<{ error?: string; code?: string }> {
  return (await response.json().catch(() => ({}))) as { error?: string; code?: string };
}

/** Use up one free search and get the token the other lead calls need. */
export async function startLeadRun(signal: AbortSignal): Promise<{ token: string; quota: LeadQuota }> {
  const response = await fetch("/api/leads/start", { method: "POST", signal });
  if (response.ok) return (await response.json()) as { token: string; quota: LeadQuota };
  const data = await readError(response);
  if (data.code === "quota-exhausted") throw new QuotaExhaustedError();
  throw new Error(data.error ?? "Could not start the search.");
}

export async function readLeadQuota(signal?: AbortSignal): Promise<LeadQuota | null> {
  try {
    const response = await fetch("/api/leads/start", { signal });
    return response.ok ? ((await response.json()) as LeadQuota) : null;
  } catch {
    return null;
  }
}

/** POST JSON to a lead route as part of a started search. */
export async function leadPost<T>(url: string, body: unknown, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", [RUN_HEADER]: token },
    body: JSON.stringify(body),
    signal,
  });
  if (response.ok) return (await response.json()) as T;
  const data = await readError(response);
  throw new Error(data.error ?? "The search failed.");
}
