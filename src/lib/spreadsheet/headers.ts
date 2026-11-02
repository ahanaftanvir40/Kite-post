/**
 * Turn a raw header row into unique, non-empty labels.
 * Empty cells become `Column N` (1-based), repeats become `Name (2)`.
 */
export function cleanHeaders(raw: unknown[]): string[] {
  const used = new Set<string>();
  return raw.map((cell, index) => {
    const base = String(cell ?? "").replace(/^\uFEFF/, "").trim() || `Column ${index + 1}`;
    let label = base;
    let n = 2;
    while (used.has(label.toLowerCase())) {
      label = `${base} (${n++})`;
    }
    used.add(label.toLowerCase());
    return label;
  });
}
