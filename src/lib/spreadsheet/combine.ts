import { cleanHeaders } from "./headers";
import { MAX_ROWS, type SheetData } from "./parse";

export const SOURCE_COLUMN = "Source tab";
const COMBINED_SUFFIX = " tabs combined";

/** True for a sheet made by `combineSheets` from several tabs. */
export function isCombinedSheet(sheet: Pick<SheetData, "name">): boolean {
  return sheet.name.endsWith(COMBINED_SUFFIX);
}

/** Every column name used by `sheets`, in first-seen order, matching names regardless of case. */
export function unionHeaders(sheets: Pick<SheetData, "headers">[]): string[] {
  const seen = new Map<string, string>();
  for (const sheet of sheets) {
    for (const header of sheet.headers) {
      const key = header.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, header);
    }
  }
  return [...seen.values()];
}

/**
 * Stack tabs into one sheet. Columns with the same name line up, a column that
 * only some tabs have stays blank for the others, and `addSource` appends a
 * column that says which tab each row came from. One tab is returned as is.
 */
export function combineSheets(sheets: SheetData[], { addSource }: { addSource: boolean }): SheetData {
  if (sheets.length === 1) return sheets[0];

  const base = unionHeaders(sheets);
  const headers = addSource ? cleanHeaders([...base, SOURCE_COLUMN]) : base;
  const sourceHeader = addSource ? headers[headers.length - 1] : null;

  const rows: Record<string, string>[] = [];
  let truncated = sheets.some((s) => s.truncated);
  for (const sheet of sheets) {
    // Look up this tab's value for each combined column by lower-cased name.
    const own = new Map(sheet.headers.map((h) => [h.trim().toLowerCase(), h]));
    for (const row of sheet.rows) {
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
      const merged: Record<string, string> = {};
      for (const header of base) {
        const from = own.get(header.trim().toLowerCase());
        merged[header] = from === undefined ? "" : (row[from] ?? "");
      }
      if (sourceHeader) merged[sourceHeader] = sheet.name;
      rows.push(merged);
    }
  }

  return {
    name: `${sheets.length}${COMBINED_SUFFIX}`,
    headers,
    rows,
    // The header is row 1 and data follows, like a single sheet.
    rowNumbers: rows.map((_, i) => i + 2),
    truncated,
  };
}
