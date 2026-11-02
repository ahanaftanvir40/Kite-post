import type { Kind, Level, Person } from "@/lib/leads/academic";
import type { WebResult } from "@/lib/leads/serper";
import { batchToXlsx } from "@/lib/spreadsheet/batches";

export interface StudyInput {
  kind: Kind;
  field: string;
  level: Level;
  countries: string[];
  university: string;
  target: number;
}

export interface StudyProgress {
  phase: "searching" | "reading" | "done";
  people: Person[];
  pagesRead: number;
  pagesFound: number;
}

const CHUNK = 6;
const MAX_PAGES = 3;

async function post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The search failed.");
  return data;
}

/** One row per email address (the same professor shows up on several pages); skips blank-email rows already listed by name. */
export function addPeople(into: Person[], found: Person[], limit: number): void {
  const emails = new Set(into.map((p) => p.email).filter(Boolean));
  const named = new Set(into.map((p) => `${p.university}|${p.name.toLowerCase()}`));
  for (const p of found) {
    if (into.length >= limit) return;
    const key = `${p.university}|${p.name.toLowerCase()}`;
    if (p.email ? emails.has(p.email) : named.has(key)) continue;
    if (p.email) emails.add(p.email);
    named.add(key);
    into.push(p);
  }
}

/**
 * Search each chosen country page by page, read the result pages, collect people, and report
 * after every step. Pages are interleaved across countries so a small target still gets variety.
 */
export async function runStudySearch(input: StudyInput, signal: AbortSignal, onProgress: (p: StudyProgress) => void): Promise<StudyProgress> {
  const state: StudyProgress = { phase: "searching", people: [], pagesRead: 0, pagesFound: 0 };
  const report = () => onProgress({ ...state, people: [...state.people] });
  const seenUrls = new Set<string>();
  report();

  for (let page = 1; page <= MAX_PAGES && state.people.length < input.target; page++) {
    for (const country of input.countries) {
      if (state.people.length >= input.target) break;
      state.phase = "searching";
      report();
      const { results } = await post<{ results: WebResult[] }>("/api/leads/academic", { kind: input.kind, field: input.field, level: input.level, country, university: input.university, page }, signal);
      const fresh = results.filter((r) => !seenUrls.has(r.url));
      fresh.forEach((r) => seenUrls.add(r.url));
      state.pagesFound += fresh.length;
      state.phase = "reading";
      report();
      for (let i = 0; i < fresh.length && state.people.length < input.target; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK);
        const { people } = await post<{ people: Person[] }>("/api/leads/people", { kind: input.kind, country, items: chunk }, signal);
        addPeople(state.people, people, input.target);
        state.pagesRead += chunk.length;
        report();
      }
    }
  }
  state.phase = "done";
  report();
  return state;
}

/** Column names double as @tokens in the email merger: @greeting, @name, @university, @field. */
const HEADERS = ["Name", "Greeting", "Email", "Other emails", "Role", "University", "Field", "Profile page", "About"];

export function peopleToXlsx(people: Person[], field: string): Uint8Array {
  const rows = people.map((p) => ({
    Name: p.name,
    Greeting: p.greeting,
    Email: p.email,
    "Other emails": p.otherEmails.join(", "),
    Role: p.role,
    University: p.university,
    Field: field,
    "Profile page": p.url,
    About: p.about,
  }));
  return batchToXlsx(HEADERS, rows, "Contacts");
}
