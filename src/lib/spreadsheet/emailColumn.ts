import { normalizeKey } from "@/lib/merge/tokens";
import { isValidEmail } from "./email";

const HEADER_HINTS = ["email", "emailaddress", "mail", "emailid", "workemail", "businessemail", "contactemail"];

/**
 * Pick the most likely email column: a header that looks like one wins
 * (as long as some values are valid), otherwise the column with the highest
 * share of valid addresses. Returns null when nothing looks like email.
 */
export function detectEmailColumn(headers: string[], rows: Record<string, string>[]): string | null {
  const sample = rows.slice(0, 200);
  const score = (header: string) => {
    const filled = sample.filter((r) => (r[header] ?? "").trim() !== "");
    if (filled.length === 0) return 0;
    return filled.filter((r) => isValidEmail(r[header])).length / filled.length;
  };

  const byHeader = headers.filter((h) => {
    const key = normalizeKey(h);
    return HEADER_HINTS.includes(key) || key.includes("email");
  });
  for (const header of byHeader) {
    if (sample.length === 0 || score(header) > 0) return header;
  }
  if (byHeader.length > 0 && sample.length === 0) return byHeader[0];

  let best: string | null = null;
  let bestScore = 0;
  for (const header of headers) {
    const s = score(header);
    if (s > bestScore) {
      best = header;
      bestScore = s;
    }
  }
  return bestScore >= 0.5 ? best : null;
}
