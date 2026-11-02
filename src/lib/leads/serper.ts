import { extractEmails, findContactUrl } from "./emails";

export class LeadsConfigError extends Error {}

export interface Place {
  title: string;
  address: string;
  category: string;
  website: string | null;
  rating: number | null;
  ratingCount: number | null;
  cid: string;
}

export interface EmailResult {
  url: string;
  emails: string[];
  error?: string;
}

const TIMEOUT_MS = 25_000;

async function serper<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) throw new LeadsConfigError("Lead finder is not set up: SERPER_API_KEY is missing.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new LeadsConfigError("The Serper API key was rejected.");
  if (response.status === 429 || (response.status === 400 && (await response.clone().text()).includes("credits"))) {
    throw new LeadsConfigError("Serper credits or rate limit reached. Try again later.");
  }
  if (!response.ok) throw new Error(`Serper returned ${response.status}.`);
  return (await response.json()) as T;
}

interface RawPlace {
  title?: string;
  address?: string;
  category?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  cid?: string;
}

export async function searchPlaces(query: string, location: string, page: number): Promise<Place[]> {
  const data = await serper<{ places?: RawPlace[] }>("https://google.serper.dev/places", { q: query, location, page });
  return (data.places ?? []).flatMap((p, i) =>
    p.title
      ? [
          {
            title: p.title,
            address: p.address ?? "",
            category: p.category ?? "",
            website: p.website ?? null,
            rating: p.rating ?? null,
            ratingCount: p.ratingCount ?? null,
            cid: p.cid ?? `${p.title}|${p.address ?? i}`,
          },
        ]
      : [],
  );
}

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** One page (10 results) of Google web search. */
export async function searchWeb(q: string, page: number): Promise<WebResult[]> {
  const data = await serper<{ organic?: { title?: string; link?: string; snippet?: string }[] }>("https://google.serper.dev/search", { q, page, num: 10 });
  return (data.organic ?? []).flatMap((o) => (o.link && o.title ? [{ title: o.title, url: o.link, snippet: o.snippet ?? "" }] : []));
}

/** Page text for a URL, via Serper's scraper (so no request ever leaves this server toward an arbitrary host). */
export async function scrapePage(url: string): Promise<{ text: string; markdown: string }> {
  const data = await serper<{ text?: string; markdown?: string }>("https://scrape.serper.dev", { url, includeMarkdown: true });
  return { text: data.text ?? "", markdown: data.markdown ?? "" };
}

/** Homepage first. If it has no email, one contact page: a linked one, else /contact. */
export async function findEmails(website: string): Promise<EmailResult> {
  try {
    const home = await scrapePage(website);
    const fromHome = extractEmails(`${home.markdown}\n${home.text}`, website);
    if (fromHome.length) return { url: website, emails: fromHome };
    const contact = findContactUrl(home.markdown, website) ?? new URL("/contact", website).toString();
    const page = await scrapePage(contact);
    return { url: website, emails: extractEmails(`${page.markdown}\n${page.text}`, website) };
  } catch (e) {
    if (e instanceof LeadsConfigError) throw e;
    return { url: website, emails: [], error: "Could not read this site." };
  }
}
