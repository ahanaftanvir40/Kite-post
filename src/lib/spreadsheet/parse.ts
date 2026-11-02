import * as XLSX from "xlsx";
import { cleanHeaders } from "./headers";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

export type SpreadsheetErrorCode =
  | "unsupported-type"
  | "too-large"
  | "unreadable"
  | "empty";

export class SpreadsheetError extends Error {
  constructor(
    public readonly code: SpreadsheetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SpreadsheetError";
  }
}

export interface SheetData {
  name: string;
  headers: string[];
  /** 1-based spreadsheet row number of each data row (header is row 1). */
  rowNumbers: number[];
  rows: Record<string, string>[];
  truncated: boolean;
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: SheetData[];
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function isBlankRow(cells: unknown[]): boolean {
  return cells.every((c) => String(c ?? "").trim() === "");
}

function sheetToData(name: string, sheet: XLSX.WorkSheet): SheetData | null {
  // raw: false => values as displayed in Excel (dates, percentages, currency).
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    blankrows: true,
    defval: "",
  });

  const headerIndex = matrix.findIndex((r) => !isBlankRow(r));
  if (headerIndex === -1) return null;

  const headers = cleanHeaders(matrix[headerIndex]);
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  let truncated = false;

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (isBlankRow(cells)) continue;
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, c) => {
      row[h] = String(cells[c] ?? "").trim();
    });
    rows.push(row);
    rowNumbers.push(i + 1);
  }

  return { name, headers, rows, rowNumbers, truncated };
}

/** Parse an uploaded .xlsx / .xls / .csv entirely in memory. Nothing leaves the browser. */
export function parseSpreadsheet(fileName: string, data: ArrayBuffer): ParsedWorkbook {
  const ext = extensionOf(fileName);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new SpreadsheetError("unsupported-type", "Use an .xlsx, .xls or .csv file.");
  }
  if (data.byteLength > MAX_FILE_BYTES) {
    throw new SpreadsheetError(
      "too-large",
      `That file is over ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.`,
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    if (ext === ".csv") {
      // Decode ourselves so a UTF-8 BOM and non-ASCII names survive.
      const text = new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, "");
      workbook = XLSX.read(text, { type: "string", raw: true });
    } else {
      workbook = XLSX.read(data, { type: "array", cellDates: false });
    }
  } catch {
    throw new SpreadsheetError("unreadable", "That file could not be read. Is it damaged or password protected?");
  }

  const sheets: SheetData[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const parsed = sheetToData(name, sheet);
    if (parsed) sheets.push(parsed);
  }

  if (sheets.length === 0) {
    throw new SpreadsheetError("empty", "No rows found. The first non-empty row should hold column names.");
  }
  return { fileName, sheets };
}

/** Browser helper. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedWorkbook> {
  return parseSpreadsheet(file.name, await file.arrayBuffer());
}
