import type { StudyCrawl } from "@/lib/db/types";
import type { Kind, Level, Person } from "@/lib/leads/academic";
import { contactKey } from "@/lib/leads/studyKey";
import type { WebResult } from "@/lib/leads/serper";
import { batchToXlsx } from "@/lib/spreadsheet/batches";
import { leadPost, startLeadRun } from "./api";

export interface StudyInput {
  kind: Kind;
  field: string;
  level: Level;
  countries: string[];
  university: string;
  target: number;
  /** A repeat search: what the earlier download already covered. Those pages are not read again and those people are left out. */
  previous?: { contacts: readonly string[]; crawl: StudyCrawl };
}

export interface StudyProgress {
  phase: "searching" | "reading" | "done";
  people: Person[];
  pagesRead: number;
  pagesFound: number;
  /** How far this search (and any it carried on from) has read. */
  crawl: StudyCrawl;
}

const CHUNK = 6;
const MAX_PAGES = 3;

/**
 * One row per email address (the same professor shows up on several pages); skips blank-email rows already listed by name,
 * and anyone in `skip`. Returns true when it stopped at the limit with new people still left over.
 */
export function addPeople(into: Person[], found: Person[], limit: number, skip?: ReadonlySet<string>): boolean {
  const emails = new Set(into.map((p) => p.email).filter(Boolean));
  const named = new Set(into.map((p) => `${p.domain}|${p.name.toLowerCase()}`));
  for (const p of found) {
    const key = `${p.domain}|${p.name.toLowerCase()}`;
    if (p.email ? emails.has(p.email) : named.has(key)) continue;
    if (skip?.has(contactKey(p))) continue;
    if (into.length >= limit) return true;
    if (p.email) emails.add(p.email);
    named.add(key);
    into.push(p);
  }
  return false;
}

/**
 * Search each chosen country page by page, read the result pages, collect people, and report
 * after every step. Pages are interleaved across countries so a small target still gets variety.
 * Uses one of the account's free searches up front; throws QuotaExhaustedError when none are left.
 *
 * A repeat search (input.previous) carries on: each country starts at the result page after the last one
 * read, pages already read are not fetched again, and people already downloaded are not listed.
 */
export async function runStudySearch(input: StudyInput, signal: AbortSignal, onProgress: (p: StudyProgress) => void): Promise<StudyProgress> {
  const { token } = await startLeadRun(signal);
  const post = <T>(url: string, body: unknown) => leadPost<T>(url, body, token, signal);
  const start = input.previous?.crawl.pages ?? {};
  const known = new Set(input.previous?.contacts ?? []);
  const crawl: StudyCrawl = { pages: { ...start }, urls: [...(input.previous?.crawl.urls ?? [])] };
  const readUrls = new Set(crawl.urls);
  const state: StudyProgress = { phase: "searching", people: [], pagesRead: 0, pagesFound: 0, crawl };
  const report = () => onProgress({ ...state, people: [...state.people], crawl: { pages: { ...crawl.pages }, urls: [...crawl.urls] } });
  const exhausted = new Set<string>();
  report();

  for (let step = 0; step < MAX_PAGES && state.people.length < input.target; step++) {
    for (const country of input.countries) {
      if (state.people.length >= input.target) break;
      if (exhausted.has(country)) continue;
      const page = (start[country] ?? 0) + step + 1;
      state.phase = "searching";
      report();
      const { results } = await post<{ results: WebResult[] }>("/api/leads/academic", { kind: input.kind, field: input.field, level: input.level, country, university: input.university, page });
      if (results.length === 0) {
        exhausted.add(country);
        continue;
      }
      const fresh = results.filter((r, i) => !readUrls.has(r.url) && results.findIndex((o) => o.url === r.url) === i);
      state.pagesFound += fresh.length;
      state.phase = "reading";
      report();
      let complete = true;
      for (let i = 0; i < fresh.length; i += CHUNK) {
        if (state.people.length >= input.target) {
          complete = false;
          break;
        }
        const chunk = fresh.slice(i, i + CHUNK);
        const { people } = await post<{ people: Person[] }>("/api/leads/people", { kind: input.kind, country, items: chunk });
        const cutShort = addPeople(state.people, people, input.target, known);
        state.pagesRead += chunk.length;
        if (cutShort) {
          // Some people on these pages did not fit, so a later search must read them again.
          complete = false;
          report();
          break;
        }
        for (const item of chunk) {
          readUrls.add(item.url);
          crawl.urls.push(item.url);
        }
        report();
      }
      // A page counts as done only when every result on it was read, so a later search never skips unread people.
      if (complete) crawl.pages[country] = page;
    }
  }
  state.phase = "done";
  report();
  return state;
}

/** Column names double as @tokens in the email merger: @greeting, @name, @university, @country, @field. */
const HEADERS = ["Name", "Greeting", "Email", "Other emails", "Role", "University", "Country", "Field", "Profile page", "About"];

export function peopleToXlsx(people: Person[], field: string): Uint8Array {
  const rows = people.map((p) => ({
    Name: p.name,
    Greeting: p.greeting,
    Email: p.email,
    "Other emails": p.otherEmails.join(", "),
    Role: p.role,
    University: p.university,
    Country: p.country,
    Field: field,
    "Profile page": p.url,
    About: p.about,
  }));
  return batchToXlsx(HEADERS, rows, "Contacts");
}
