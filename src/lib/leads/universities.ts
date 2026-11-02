import NAMES from "./universities.json";

const BY_DOMAIN: Record<string, string> = NAMES;

/** "ETHZ - ETH Zurich" -> "ETH Zurich", "University College London, University of London" -> "University College London". */
export function tidyName(raw: string): string {
  let name = raw.trim();
  const dash = name.split(/\s+[-–—]\s+/);
  if (dash.length > 1) name = dash[dash.length - 1];
  return name.replace(/,\s*University of [A-Z][\p{L} ]+$/u, "").trim();
}

const WORD = "[\\p{Lu}][\\p{L}'’-]+";
const CANDIDATE = new RegExp(
  [
    `(?:The )?University of ${WORD}(?: (?:and |upon |of )?${WORD}){0,2}`,
    `${WORD}(?: ${WORD}){0,2} University`,
    `(?:Technische |Medizinische )?Universit(?:ät|aet) ${WORD}`,
    `Universit(?:é|e) (?:de |d')?${WORD}`,
    `${WORD} Universiteit`,
    `Imperial College London`,
  ].join("|"),
  "gu",
);

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** True when the name shares a word with the site's own name, so a stray mention of another university is not taken. */
function fitsDomain(name: string, domain: string): boolean {
  const label = plain(domain.split(".")[0]).replace(/[^a-z]/g, "");
  if (label.length < 2) return false;
  return plain(name)
    .split(/[^a-z]+/)
    .some((w) => w.length >= 3 && w !== "university" && w !== "universitat" && (w.includes(label) || label.includes(w) || (label.length >= 2 && w.startsWith(label))));
}

/** The university's name as the page itself writes it: the most repeated candidate that fits the domain. */
export function nameFromText(domain: string, text: string): string | null {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(CANDIDATE)) {
    const name = m[0].replace(/^The /, "").trim();
    if (fitsDomain(name, domain)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let top = 0;
  for (const [name, n] of counts) {
    if (n > top) {
      best = name;
      top = n;
    }
  }
  return best;
}

/**
 * The proper university name for a web domain: from the bundled list when it is there,
 * else from the page text, else the domain itself so the column is never blank.
 */
export function universityName(domain: string, pageText: string): string {
  const d = domain.toLowerCase();
  const listed = BY_DOMAIN[d];
  if (listed) return tidyName(listed);
  return nameFromText(d, pageText) ?? d;
}

const homepages = new Map<string, string | null>();

/**
 * The name a university's own homepage uses, for domains the bundled list lacks. One lookup per
 * domain per server process; a failure is remembered as "unknown" so it is not retried every search.
 */
export async function homepageName(domain: string, scrape: (url: string) => Promise<{ text: string; markdown: string }>): Promise<string | null> {
  const d = domain.toLowerCase();
  if (homepages.has(d)) return homepages.get(d) ?? null;
  let name: string | null = null;
  for (const url of [`https://www.${d}`, `https://${d}`]) {
    try {
      const page = await scrape(url);
      name = nameFromText(d, (page.markdown || page.text).slice(0, 6000));
      if (name) break;
    } catch {
      // Try the next address.
    }
  }
  homepages.set(d, name);
  return name;
}
