import type { StudyCrawl, StudySearchParams, StudySearchRecord } from "@/lib/db/types";
import { contactKey } from "@/lib/leads/studyKey";
import type { Person } from "@/lib/leads/academic";

/**
 * The earlier download with these settings, or null when there is none. Anything that goes wrong
 * (signed out, no database, offline) also reads as null: a missing heads-up must never block a search.
 */
export async function findPreviousDownload(params: StudySearchParams, signal?: AbortSignal): Promise<StudySearchRecord | null> {
  try {
    const query = new URLSearchParams({ kind: params.kind, field: params.field, level: params.level, countries: params.countries.join(","), university: params.university });
    const response = await fetch(`/api/leads/history?${query}`, { signal });
    if (!response.ok) return null;
    return ((await response.json()) as { previous: StudySearchRecord | null }).previous;
  } catch {
    return null;
  }
}

/** Remember who was in a downloaded file and how far the search got. Best effort: a failure here must not get in the way of the download. */
export async function rememberDownload(params: StudySearchParams, people: Person[], crawl: StudyCrawl): Promise<void> {
  try {
    await fetch("/api/leads/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, contacts: people.map(contactKey), crawl }),
    });
  } catch {
    // Ignored on purpose.
  }
}
