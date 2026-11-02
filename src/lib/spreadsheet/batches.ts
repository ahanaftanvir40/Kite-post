import * as XLSX from "xlsx";
import type { SheetData } from "./parse";

export const MIN_BATCH_SIZE = 5;
export const DEFAULT_BATCH_SIZE = 20;
/** Saved list names stop at 80 characters. */
const MAX_NAME_LENGTH = 80;

export type Row = Record<string, string>;

export interface Batch {
  /** 1-based position. */
  index: number;
  name: string;
  /** The `.xlsx` file name for this batch. */
  fileName: string;
  rows: Row[];
}

/** Why a batch size cannot be used, or null when it can. */
export function batchSizeProblem(size: number, rowCount: number): string | null {
  if (!Number.isInteger(size)) return "Enter a whole number.";
  if (size < MIN_BATCH_SIZE) return `The smallest batch is ${MIN_BATCH_SIZE} rows.`;
  if (size >= rowCount) return rowCount === 0 ? "There are no rows to split." : `Pick a number below ${rowCount} to make more than one batch.`;
  return null;
}

/** Row counts per batch, e.g. 110 rows in 20s gives [20, 20, 20, 20, 20, 10]. */
export function batchSizes(rowCount: number, size: number): number[] {
  if (rowCount <= 0 || size < 1) return [];
  const full = Math.floor(rowCount / size);
  const rest = rowCount % size;
  return [...Array<number>(full).fill(size), ...(rest > 0 ? [rest] : [])];
}

/** Characters that cannot be in a file name on common systems. */
function fileSafe(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Cut rows into batches of `size` (the last one may be smaller), named
 * "<base> - batch 2 of 6". `base` is shortened so every name fits a saved list.
 */
export function splitIntoBatches(rows: Row[], size: number, base: string): Batch[] {
  const sizes = batchSizes(rows.length, size);
  const total = sizes.length;
  const clean = fileSafe(base) || "recipients";
  let start = 0;
  return sizes.map((count, i) => {
    const suffix = ` - batch ${i + 1} of ${total}`;
    const name = `${clean.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
    const batch: Batch = { index: i + 1, name, fileName: `${name}.xlsx`, rows: rows.slice(start, start + count) };
    start += count;
    return batch;
  });
}

/** A one-sheet Excel file holding `rows` under the original column names. */
export function batchToXlsx(headers: string[], rows: Row[], sheetName: string): Uint8Array {
  const matrix = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  // Sheet names allow 31 characters and not : \ / ? * [ ]
  const safeName = sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31).trim() || "Sheet1";
  XLSX.utils.book_append_sheet(book, sheet, safeName);
  return new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** The base name for batches: the file name without its extension. */
export function batchBaseName(fileName: string, sheet: Pick<SheetData, "name">, multiSheet: boolean): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return multiSheet ? `${base} ${sheet.name}` : base;
}

export interface TabFile {
  /** Position of the tab in the workbook. */
  index: number;
  /** Saved list name: "<file> - <tab>", shortened to fit. */
  name: string;
  fileName: string;
  headers: string[];
  rows: Row[];
}

/** One file per tab, named "<workbook> - <tab>". Names stay unique even when two tabs share a name. */
export function tabFiles(fileName: string, tabs: { index: number; sheet: Pick<SheetData, "name" | "headers" | "rows"> }[]): TabFile[] {
  const base = fileSafe(fileName.replace(/\.[^.]+$/, "")) || "recipients";
  const seen = new Map<string, number>();
  return tabs.map(({ index, sheet }) => {
    const tab = fileSafe(sheet.name) || `Tab ${index + 1}`;
    const full = `${base} - ${tab}`.slice(0, MAX_NAME_LENGTH).trimEnd();
    const key = full.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    const name = count === 1 ? full : `${full.slice(0, MAX_NAME_LENGTH - ` (${count})`.length).trimEnd()} (${count})`;
    return { index, name, fileName: `${name}.xlsx`, headers: sheet.headers, rows: sheet.rows };
  });
}
