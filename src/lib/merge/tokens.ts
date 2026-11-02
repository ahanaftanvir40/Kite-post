/**
 * Matches `@name` tokens. The lookbehind rejects a match when the `@` is glued
 * to a word character or dot, so `john@gmail.com` is never treated as a token.
 */
export const TOKEN_PATTERN = "(?<![\\w.])@([A-Za-z]\\w*)";

export function createTokenRegex(): RegExp {
  return new RegExp(TOKEN_PATTERN, "g");
}

/** Lowercase and strip everything that is not a letter or digit. */
export function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface TokenOccurrence {
  /** Text as typed, without the leading `@`. */
  raw: string;
  /** Normalized key used for lookups. */
  key: string;
  start: number;
  end: number;
}

export function findTokens(text: string): TokenOccurrence[] {
  const out: TokenOccurrence[] = [];
  for (const match of text.matchAll(createTokenRegex())) {
    const start = match.index ?? 0;
    out.push({
      raw: match[1],
      key: normalizeKey(match[1]),
      start,
      end: start + match[0].length,
    });
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Closest known key within a small edit distance, or null. */
export function suggestKey(key: string, known: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of known) {
    const d = levenshtein(key, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  const limit = Math.max(1, Math.floor(key.length / 3));
  return best !== null && bestDistance <= limit ? best : null;
}
