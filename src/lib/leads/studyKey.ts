import type { StudySearchParams } from "@/lib/db/types";
import type { Person } from "./academic";

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * What makes two student searches "the same search": who, subject, level, countries, university.
 * How many contacts were asked for is not part of it. Ignores case, spacing and country order.
 */
export function studyKey(p: StudySearchParams): string {
  return [p.kind, norm(p.field), p.level, [...new Set(p.countries)].sort().join(","), norm(p.university)].join("|");
}

/** Who a contact is, for telling a repeat from someone new: their email, else name at university. */
export function contactKey(p: Pick<Person, "email" | "domain" | "name">): string {
  return p.email ? p.email.toLowerCase() : `${p.domain}|${p.name.toLowerCase()}`;
}
