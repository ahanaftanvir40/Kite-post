import { COUNTRY_BY_CODE, type Country } from "./countries";
import { cleanEmail, hostOf } from "./emails";
import { LeadsConfigError, scrapePage, searchWeb, type WebResult } from "./serper";
import { homepageName, universityName } from "./universities";

export type Kind = "professors" | "admissions" | "funding";
export type Level = "any" | "masters" | "phd" | "postdoc";

export interface Person {
  name: string;
  greeting: string;
  role: string;
  /** The university's name, e.g. University of Oxford. */
  university: string;
  /** Registrable domain of the university site, e.g. ox.ac.uk. */
  domain: string;
  /** Country the search was run in, e.g. United Kingdom. */
  country: string;
  email: string;
  otherEmails: string[];
  about: string;
  url: string;
}

const LEVEL_TERM: Record<Level, string> = { any: "", masters: "master", phd: "PhD", postdoc: "postdoc" };

export function buildQuery(kind: Kind, field: string, level: Level, country: Country, university: string): string {
  const site = `site:${country.suffix}`;
  const f = `"${field.replace(/"/g, "")}"`;
  const uni = university ? `"${university.replace(/"/g, "")}"` : "";
  const lv = LEVEL_TERM[level];
  let rest: string[];
  switch (kind) {
    case "professors":
      rest = [uni, f, "professor", lv, "email", "-filetype:pdf"];
      break;
    case "admissions":
      rest = [uni, f, lv, "admissions international applicants contact email", "-filetype:pdf"];
      break;
    case "funding":
      rest = [uni, f, lv, "scholarship funding international students contact", "-filetype:pdf"];
      break;
    default: {
      const never: never = kind;
      throw new Error(`Unknown kind ${String(never)}`);
    }
  }
  return [site, ...rest].filter(Boolean).join(" ");
}

export async function searchAcademic(kind: Kind, field: string, level: Level, countryCode: string, university: string, page: number): Promise<WebResult[]> {
  const country = COUNTRY_BY_CODE.get(countryCode);
  if (!country) return [];
  return searchWeb(buildQuery(kind, field, level, country, university), page);
}

/** ox.ac.uk for cs.ox.ac.uk, tum.de for www.tum.de. */
export function universityDomain(host: string, suffix: string): string {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (h.endsWith(`.${suffix}`)) {
    const labels = h.slice(0, -suffix.length - 1).split(".");
    return `${labels[labels.length - 1]}.${suffix}`;
  }
  return h.split(".").slice(-2).join(".");
}

const TITLE = /^(?:meet\s+)?(?:(?:prof(?:essor)?|dr|mr|mrs|ms|assoc|assist|dipl|ing|habil)\.?\s+)+/i;
const PARTICLE = new Set(["van", "von", "de", "der", "den", "da", "di", "del", "la", "le", "bin", "al", "el", "ten", "ter"]);
const NAME_STOP = /\b(university|universit[äay]t?|department|school|faculty|institute|home|page|people|staff|contact|research|group|lab|laboratory|centre|center|profile|professor|lecturer|college|email|office|news|about|team|members?|students?|admissions?|programmes?|science|sciences|engineering|studies|director|chair|reader|phd|msc|postdoc|information|areas?|interests?|publications?|teaching)\b/i;

/** The person's name if the text looks like one ("Prof. Dr. Reinhard Heckel" -> "Reinhard Heckel"), else null. */
export function cleanName(raw: string): string | null {
  const s = raw.replace(/^(?:name|email|contact)(?=\p{Lu})/u, "").replace(TITLE, "").replace(/\s+/g, " ").trim();
  const words = s.split(" ");
  if (words.length < 2 || words.length > 4 || s.length > 50 || NAME_STOP.test(s)) return null;
  // "M.E." or "Ph.D." after a name is a degree, so this is a programme page, not a person.
  if (words.some((w) => /^(?:\p{Lu}\p{Ll}?\.){2,}$/u.test(w))) return null;
  return words.every((w) => PARTICLE.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w)) ? s : null;
}

function nameFromEmail(email: string): string | null {
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^[a-z]{2,}$/.test(p))) return null;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** True when part of the name shows up in the email address, a strong sign they belong together. */
function overlaps(name: string, email: string): boolean {
  const local = plain(email.split("@")[0]).replace(/[^a-z]/g, "");
  return plain(name)
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .some((t) => t.length >= 3 && !PARTICLE.has(t) && local.includes(t));
}

const GENERIC = /^(info|contact|admissions?|gradadmissions?|graduate|grad|apply|enquiries|inquiries|office|secretary|webmaster|web|admin|department|dept|school|faculty|international|study|studies|programs?|funding|scholarships?|registrar|helpdesk|communications|press|media|it|hr|jobs|careers|mail|postgraduate|pgadmissions|undergraduate|reception|phd|masters?|doctoral|research)$/;
const isGeneric = (email: string) => {
  const local = email.split("@")[0];
  return GENERIC.test(local) || GENERIC.test(local.split(/[._-]/)[0]);
};

const ROLE = /\b(?:(?:Distinguished|Assistant|Associate|Emeritus|Visiting|Adjunct|Research|Full|Junior|Honorary)\s+)?Professor\b(?:\s+(?:of|in)\s+[A-Z][\p{L}&' -]{2,50})?|\b(?:Senior\s+)?Lecturer\b|\bReader\b|\bGroup Leader\b|\bProf\.(?:\s*Dr\.)?/u;

function roleIn(text: string): string {
  const m = ROLE.exec(text);
  if (!m) return "";
  return m[0].trim().replace(/^Prof\.(?:\s*Dr\.)?$/, "Professor");
}

function greetingFor(name: string, role: string): string {
  if (!name) return "Hello,";
  const words = name.split(" ");
  const cut = words.findIndex((w, i) => i > 0 && PARTICLE.has(w.toLowerCase()));
  const last = cut > 0 ? words.slice(cut).join(" ") : words[words.length - 1];
  if (/professor/i.test(role)) return `Dear Professor ${last},`;
  if (/lecturer|reader|group leader/i.test(role)) return `Dear Dr. ${last},`;
  return `Dear ${name},`;
}

/** Undo the common "name [at] uni [dot] edu" spam protection before matching. */
function deobfuscate(text: string): string {
  return text.replace(/\s*[[(]\s*at\s*[\])]\s*/gi, "@").replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, ".");
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

function emailsWithPosition(md: string): { email: string; index: number }[] {
  const seen = new Set<string>();
  const out: { email: string; index: number }[] = [];
  for (const m of md.matchAll(EMAIL_RE)) {
    const email = cleanEmail(m[0]);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, index: m.index ?? 0 });
  }
  return out;
}

const snip = (s: string, n = 220) => s.replace(/\s+/g, " ").trim().slice(0, n);

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return base;
  }
}

/**
 * Turns one scraped page into people (or office contacts). Three page shapes:
 * a staff directory (many emails, each paired with the name just before it), a single
 * profile (one or two emails, name from the page title), or an office page (admissions, funding).
 * ponytail: layout heuristics; unusual pages yield a blank name, upgrade to an LLM pass if that bites.
 */
export function extractPeople(kind: Kind, item: WebResult, pageText: string, country: Country): Person[] {
  const text = `${item.title}\n${item.snippet}\n${pageText.slice(0, 4000)}`;
  // A person belongs to the university in their email address. A job board or news site hosting the page does not count.
  return readPeople(kind, item, pageText, country).map((p) => {
    const domain = p.email ? universityDomain(p.email.split("@")[1], country.suffix) : p.domain;
    return { ...p, domain, university: universityName(domain, text) };
  });
}

function readPeople(kind: Kind, item: WebResult, pageText: string, country: Country): Person[] {
  const host = hostOf(item.url) ?? "";
  const domain = universityDomain(host, country.suffix);
  const md = deobfuscate(pageText);
  const emails = emailsWithPosition(md).filter(({ email }) => {
    const d = email.split("@")[1];
    return d === country.suffix || d.endsWith(`.${country.suffix}`) || universityDomain(d, country.suffix) === domain;
  });
  const base = { university: domain, domain, country: country.name, url: item.url };

  if (kind !== "professors") {
    if (!emails.length) return [];
    const sorted = emails.map((e) => e.email).sort((a, b) => Number(isGeneric(b)) - Number(isGeneric(a)));
    return [
      {
        ...base,
        name: item.title.split(/\s+[-–—|]\s+/)[0].replace(/\.{3}|…/g, "").trim().slice(0, 90),
        greeting: kind === "admissions" ? "Dear Admissions Team," : "Dear Scholarships Team,",
        role: kind === "admissions" ? "Admissions" : "Funding",
        email: sorted[0],
        otherEmails: sorted.slice(1, 4),
        about: snip(item.snippet),
      },
    ];
  }

  const personal = emails.filter((e) => !isGeneric(e.email));
  const titleName = cleanName(item.title.split(/\s+[-–—]\s+|\s*[|·]\s*|:\s+|,\s*/)[0]);

  if (personal.length <= 2) {
    const role = roleIn(`${item.title}. ${item.snippet}. ${md.slice(0, 800)}`);
    if (!personal.length) {
      // No public email: list a clear profile only (name in the URL, role in the search snippet), never a topic or news page.
      const snippetRole = roleIn(`${item.title}. ${item.snippet}`);
      if (!titleName || !snippetRole || !overlaps(titleName, item.url.replace(/^https?:\/\/[^/]+/, ""))) return [];
      return [{ ...base, name: titleName, greeting: greetingFor(titleName, snippetRole), role: snippetRole, email: "", otherEmails: [], about: snip(item.snippet) }];
    }
    // An address that matches neither the page's person nor a first.last pattern is a shared inbox (press office, etc).
    const ranked = personal.map((e) => e.email).filter((e) => (titleName !== null && overlaps(titleName, e)) || nameFromEmail(e) !== null);
    if (!ranked.length) return [];
    ranked.sort((a, b) => Number(titleName !== null && overlaps(titleName, b)) - Number(titleName !== null && overlaps(titleName, a)));
    const name = titleName ?? nameFromEmail(ranked[0]) ?? "";
    return [{ ...base, name, greeting: greetingFor(name, role), role, email: ranked[0], otherEmails: ranked.slice(1), about: snip(item.snippet) }];
  }

  return personal.slice(0, 40).flatMap(({ email, index }) => {
    const before = md.slice(Math.max(0, index - 600), index);
    const links = new Map<string, string>();
    for (const m of before.matchAll(/\[([^\]]{2,60})\]\(([^)\s]+)\)/g)) links.set(m[1].trim(), m[2]);
    const candidates = before
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*#<>_`]/g, "")
      .split(/[\n|]+/)
      .map((s) => cleanName(s.trim()))
      .filter((s): s is string => s !== null);
    // In a directory a person's name sits next to their email; an address no nearby name matches is a shared inbox.
    const name = [...candidates].reverse().find((c) => overlaps(c, email));
    if (!name) return [];
    const at = before.lastIndexOf(name.split(" ").pop() ?? name);
    const role = roleIn(md.slice(index - before.length + Math.max(at, 0), index + 60));
    const link = [...links].find(([text]) => cleanName(text) === name)?.[1];
    return [{ ...base, url: link ? absolute(link, item.url) : item.url, name, greeting: greetingFor(name, role), role, email, otherEmails: [], about: `Listed on: ${snip(item.title, 100)}` }];
  });
}

/** For universities neither the list nor the page named, read the name off the university's own homepage. */
async function nameUnknownUniversities(people: Person[]): Promise<Person[]> {
  const unknown = [...new Set(people.filter((p) => p.university === p.domain).map((p) => p.domain))];
  const names = new Map(await Promise.all(unknown.map(async (d) => [d, await homepageName(d, scrapePage)] as const)));
  return people.map((p) => (names.get(p.domain) ? { ...p, university: names.get(p.domain)! } : p));
}

/** Scrape each result and pull out people. A page that fails to load just yields none. */
export async function findPeople(kind: Kind, countryCode: string, items: WebResult[]): Promise<Person[]> {
  const country = COUNTRY_BY_CODE.get(countryCode);
  if (!country) return [];
  const pages = await Promise.all(
    items.map(async (item) => {
      try {
        const page = await scrapePage(item.url);
        return extractPeople(kind, item, page.markdown || page.text, country);
      } catch (e) {
        if (e instanceof LeadsConfigError) throw e;
        return [];
      }
    }),
  );
  return nameUnknownUniversities(pages.flat());
}
