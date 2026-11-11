import { keyOf } from "@/lib/db/types";
import { listLists, saveList } from "./api";
import { suggestName } from "./components/SaveListModal";
import { combineSheets, type ParsedWorkbook, type SheetData } from "@/lib/spreadsheet";
import type { RecipientListInput } from "@/lib/db/types";
import { sheetSavable, useMergeStore, workbookSavable } from "./store";

/**
 * Save as a new list named after the file, never over an existing one. Returns the name used.
 * With `replacing`, the list of that name is updated instead: that is changing the tabs of a saved list.
 */
async function saveAsNew(
  workspaceId: string,
  fileName: string,
  list: Pick<RecipientListInput, "headers" | "emailColumn" | "rows" | "tabs">,
  replacing: string | null,
): Promise<string> {
  if (replacing !== null) {
    await saveList(workspaceId, { name: replacing, fileName, ...list });
    useMergeStore.getState().touchLists();
    return replacing;
  }
  const taken = (await listLists(workspaceId)).map((l) => l.name);
  const base = fileName.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "My list";
  const name = taken.some((t) => keyOf(t) === keyOf(base)) ? suggestName(base, taken) : base;
  await saveList(workspaceId, { name, fileName, ...list });
  // Lists already on screen were loaded before this one existed.
  useMergeStore.getState().touchLists();
  return name;
}

/** Where a list can be saved right now: the signed-in account's active workspace, or null when saving is off. */
function saveTarget(): string | null {
  const state = useMergeStore.getState();
  const canSave = Boolean(state.session?.account && state.session.savingAvailable);
  return canSave ? state.activeWorkspaceId : null;
}

/**
 * Files are saved as they are chosen, so nobody has to remember to press Save, and the screen waits
 * for it: the saved list exists by the time Selected file shows. A list never replaces an existing
 * one, a taken name gets "(2)", "(3)"... instead. Each of these resolves to the list's name, or to
 * null when there is nothing to save (saving is off, or the sheet has no email column to save
 * against). A failure is thrown, for the screen that is still open to show.
 * `replacing` is the saved list whose tabs are being changed: it is updated, not copied.
 */

/**
 * Save a file's one sheet as a list, and wait for it. Used as a file is chosen, before it opens, so
 * its saved list exists by the time Selected file shows.
 */
export async function saveSheet(fileName: string, sheet: SheetData, replacing: string | null): Promise<string | null> {
  const workspaceId = saveTarget();
  const list = sheetSavable(sheet);
  if (!workspaceId || !list) return null;
  return saveAsNew(workspaceId, fileName, list, replacing);
}

/** Save these tabs of a file as one workbook list holding every tab, not one list per tab. */
export async function saveKeptWorkbook(source: ParsedWorkbook, indices: number[], replacing: string | null): Promise<string | null> {
  const workspaceId = saveTarget();
  const list = workbookSavable(source, indices);
  if (!workspaceId || !list) return null;
  return saveAsNew(workspaceId, source.fileName, list, replacing);
}

/** Save the chosen tabs of a file stacked into one list, before it opens. Same rules as `saveSheet`. */
export async function saveStackedTabs(source: ParsedWorkbook, indices: number[], addSource: boolean, replacing: string | null): Promise<string | null> {
  const sheets = [...new Set(indices)]
    .sort((a, b) => a - b)
    .flatMap((i) => (source.sheets[i] ? [source.sheets[i]] : []));
  if (sheets.length === 0) return null;
  return saveSheet(source.fileName, combineSheets(sheets, { addSource }), replacing);
}
