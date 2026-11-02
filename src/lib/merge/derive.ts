import { normalizeKey } from "./tokens";

export interface FieldDef {
  /** Normalized token key, e.g. `firstname`. */
  key: string;
  /** Original header (or a readable label for derived fields). */
  label: string;
  derived: boolean;
}

export type Values = Record<string, string>;

const FULL_NAME_KEYS = ["name", "fullname"];

/** Split "Ada Lovelace King" into first / last. Last is everything after the first word. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function findFullNameHeader(headers: string[]): string | null {
  for (const key of FULL_NAME_KEYS) {
    const hit = headers.find((h) => normalizeKey(h) === key);
    if (hit) return hit;
  }
  return null;
}

/** Fields a template may reference, including derived `firstname` / `lastname`. */
export function listFields(headers: string[]): FieldDef[] {
  const seen = new Set<string>();
  const fields: FieldDef[] = [];
  for (const header of headers) {
    const key = normalizeKey(header);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: header, derived: false });
  }
  const nameHeader = findFullNameHeader(headers);
  if (nameHeader) {
    if (!seen.has("firstname")) {
      fields.push({ key: "firstname", label: `First name (from ${nameHeader})`, derived: true });
    }
    if (!seen.has("lastname")) {
      fields.push({ key: "lastname", label: `Last name (from ${nameHeader})`, derived: true });
    }
  }
  return fields;
}

/** Map one spreadsheet row to `{ normalizedKey: value }`. First column wins on key collisions. */
export function buildValues(headers: string[], row: Record<string, string>): Values {
  const values: Values = {};
  for (const header of headers) {
    const key = normalizeKey(header);
    if (!key || key in values) continue;
    values[key] = (row[header] ?? "").trim();
  }
  const nameHeader = findFullNameHeader(headers);
  if (nameHeader) {
    const { first, last } = splitName(row[nameHeader] ?? "");
    if (!("firstname" in values)) values.firstname = first;
    if (!("lastname" in values)) values.lastname = last;
  }
  return values;
}
