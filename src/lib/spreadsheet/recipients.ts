import { buildValues, type Values } from "@/lib/merge/derive";
import { isValidEmail, normalizeEmail } from "./email";
import type { SheetData } from "./parse";

export type RowIssue = "invalid-email" | "duplicate" | "empty-email";

export interface Recipient {
  /** Stable id for this run, e.g. `r3`. */
  id: string;
  /** Row number in the source sheet. */
  rowNumber: number;
  email: string;
  values: Values;
  issues: RowIssue[];
}

/** Build recipients from a sheet using the chosen email column and flag problem rows. */
export function buildRecipients(sheet: SheetData, emailColumn: string): Recipient[] {
  const seen = new Set<string>();
  return sheet.rows.map((row, index) => {
    const email = (row[emailColumn] ?? "").trim();
    const issues: RowIssue[] = [];
    if (!email) {
      issues.push("empty-email");
    } else if (!isValidEmail(email)) {
      issues.push("invalid-email");
    } else {
      const key = normalizeEmail(email);
      if (seen.has(key)) issues.push("duplicate");
      seen.add(key);
    }
    return {
      id: `r${index}`,
      rowNumber: sheet.rowNumbers[index],
      email,
      values: buildValues(sheet.headers, row),
      issues,
    };
  });
}

/** Rows that should not be sent by default (anything flagged). */
export function defaultExcluded(recipients: Recipient[]): Set<string> {
  return new Set(recipients.filter((r) => r.issues.length > 0).map((r) => r.id));
}

export const ISSUE_LABEL: Record<RowIssue, string> = {
  "invalid-email": "Invalid email",
  duplicate: "Duplicate",
  "empty-email": "No email",
};
