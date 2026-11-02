import { scrapePage } from "./serper";

export interface LeadPlan {
  /** One line on who the leads are, shown to the user. */
  audience: string;
  /** Google Maps style searches, e.g. "dental clinic". */
  queries: string[];
  /** True when a model wrote the plan; false when we fell back to the description itself. */
  ai: boolean;
}

const MAX_QUERIES = 4;

const SYSTEM = `You help a business find customers on Google Maps. Given a product description (and optionally text from its website), reply with ONLY JSON:
{"audience": "<one sentence: which kinds of local businesses would buy this>", "queries": ["<2-4 short Google Maps search phrases for those business types, e.g. 'dental clinic'>"]}
Queries are business types, never product names. No other text.`;

function parsePlan(content: string): { audience: string; queries: string[] } | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(content.slice(start, end + 1)) as { audience?: unknown; queries?: unknown };
    const queries = Array.isArray(raw.queries) ? raw.queries.filter((q): q is string => typeof q === "string" && q.trim().length > 1) : [];
    if (!queries.length) return null;
    return {
      audience: typeof raw.audience === "string" ? raw.audience.trim().slice(0, 300) : "",
      queries: queries.map((q) => q.trim().slice(0, 80)).slice(0, MAX_QUERIES),
    };
  } catch {
    return null;
  }
}

/**
 * Turns "what I sell" into search phrases. Needs OPENROUTER_API_KEY; without it (or if the free
 * model fails) the description itself becomes the search, so the feature still works.
 */
export async function planLeads(description: string, productUrl: string | null): Promise<LeadPlan> {
  const fallback: LeadPlan = { audience: "", queries: [description.slice(0, 80)], ai: false };
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return fallback;

  let siteText = "";
  if (productUrl) {
    try {
      siteText = (await scrapePage(productUrl)).text.slice(0, 3000);
    } catch {
      // The description alone is enough.
    }
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Description: ${description}\n\nWebsite text: ${siteText || "(not available)"}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const plan = parsePlan(data.choices?.[0]?.message?.content ?? "");
    return plan ? { ...plan, ai: true } : fallback;
  } catch {
    return fallback;
  }
}
