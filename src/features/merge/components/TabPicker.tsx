"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { keyOf } from "@/lib/db/types";
import {
  batchToXlsx,
  createZip,
  detectEmailColumn,
  isValidEmail,
  MAX_ROWS,
  tabFiles,
  unionHeaders,
  type ParsedWorkbook,
  type SheetData,
} from "@/lib/spreadsheet";
import { listLists, saveList } from "../api";
import { download } from "../download";
import { useActiveWorkspace } from "../hooks";
import { messageOf, useSavedItems } from "../saved";
import { TabFilesModal, type CreatedTabFile } from "./TabFilesModal";

interface Props {
  source: ParsedWorkbook;
  /** Tabs ticked when the picker opens. */
  initial?: number[];
  /** Work on these tabs as one list: a single tab, or several stacked. */
  onUse: (indices: number[], options: { addSource: boolean }) => Promise<void>;
  /** Keep these tabs together as one workbook, to switch between in the Selected file view. */
  onKeep: (indices: number[]) => Promise<void>;
  /** Work on one tab file that was just made, as a file of its own. `savedAs` is its saved list, if it has one. */
  onOpenTabFile: (tab: SheetData, fileName: string, savedAs: string | null) => void;
  /** Leave for Recipients, where the saved lists are, after the tab files were made. */
  onFinishSplit: () => void;
  onCancel: () => void;
  /** The saved list whose tabs are being changed. Keeping or stacking updates it rather than adding another. */
  updating?: string | null;
}

/** What several ticked tabs become: a file each, one workbook to switch between, or one stacked list. */
type Mode = "files" | "workbook" | "stack";

/** What saving each tab as its own file produced. */
interface SplitResult {
  files: CreatedTabFile[];
  downloaded: boolean;
  savedIn: string | null;
}

interface TabInfo {
  index: number;
  sheet: SheetData;
  emailColumn: string | null;
  emails: number;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function describe(sheet: SheetData, index: number): TabInfo {
  const emailColumn = detectEmailColumn(sheet.headers, sheet.rows);
  const emails = emailColumn ? sheet.rows.filter((r) => isValidEmail(r[emailColumn] ?? "")).length : 0;
  return { index, sheet, emailColumn, emails };
}

function ModeOption({ mode, current, onPick, title, children }: { mode: Mode; current: Mode; onPick: (mode: Mode) => void; title: string; children: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-stamp border border-line bg-sheet px-3.5 py-3 transition-colors hover:border-kite-ink has-[:checked]:border-postal has-[:checked]:bg-postal-wash">
      <input type="radio" name="tab-mode" className="mt-0.5 accent-postal" checked={current === mode} onChange={() => onPick(mode)} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-ink-3">{children}</span>
      </span>
    </label>
  );
}

/** Shown after uploading a file with several tabs: choose which to use, and what to do with more than one. */
export function TabPicker({ source, initial, onUse, onKeep, onOpenTabFile, onFinishSplit, onCancel, updating = null }: Props) {
  const tabs = useMemo(() => source.sheets.map(describe), [source]);
  const [picked, setPicked] = useState<Set<number>>(() => {
    if (initial && initial.length > 0) return new Set(initial);
    // Start with the first tab that looks like a list of people.
    const first = tabs.find((t) => t.emailColumn !== null);
    return new Set(first ? [first.index] : []);
  });
  // Changing the tabs of a saved list edits that list, so start from keeping them together.
  const [mode, setMode] = useState<Mode>(updating !== null ? "workbook" : "files");
  const [addSource, setAddSource] = useState(true);

  const workspace = useActiveWorkspace();
  const canSave = workspace.ready && workspace.id !== null;
  const workspaceId = workspace.id ?? "";
  const { items: existing } = useSavedItems(() => listLists(workspaceId), canSave, workspaceId);
  const [alsoDownload, setAlsoDownload] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<SplitResult | null>(null);

  const chosen = tabs.filter((t) => picked.has(t.index));
  const several = chosen.length > 1;
  const totalRows = chosen.reduce((sum, t) => sum + t.sheet.rows.length, 0);
  const keptRows = Math.min(totalRows, MAX_ROWS);
  const differing = several && unionHeaders(chosen.map((t) => t.sheet)).length > Math.max(...chosen.map((t) => t.sheet.headers.length));
  const capped = several && totalRows > MAX_ROWS;

  const files = tabFiles(source.fileName, chosen.map((t) => ({ index: t.index, sheet: t.sheet })));
  const emailColumns = new Map(tabs.map((t) => [t.index, t.emailColumn]));
  // A saved list needs an email column, so tabs without one can only be downloaded.
  const listable = files.filter((f) => emailColumns.get(f.index));
  const splitting = several && mode === "files";
  // Without a workspace to save into, the files have nowhere to go but a download.
  const toFiles = !canSave || alsoDownload;
  const used = new Set(existing.map((l) => keyOf(l.name)));
  const clashes = splitting && canSave ? listable.filter((f) => used.has(keyOf(f.name))) : [];
  const skipped = splitting && canSave ? files.length - listable.length : 0;
  const nothingToSave = splitting && canSave && !toFiles && listable.length === 0;
  const blocked = clashes.length > 0 || nothingToSave;

  async function splitIntoFiles() {
    if (blocked || pending) return;
    setPending(true);
    setError(null);
    try {
      if (toFiles) {
        const built = files.map((f) => ({ name: f.fileName, data: batchToXlsx(f.headers, f.rows, f.name) }));
        const first = built[0];
        if (built.length === 1 && first) download(first.name, first.data, XLSX_TYPE);
        else download(`${source.fileName.replace(/\.[^.]+$/, "")} - tabs.zip`, createZip(built), "application/zip");
      }
      const savedTo = canSave && workspaceId ? (workspace.name ?? "this workspace") : null;
      if (savedTo !== null) {
        let saved = 0;
        try {
          for (const f of listable) {
            const emailColumn = emailColumns.get(f.index);
            if (!emailColumn) continue;
            await saveList(workspaceId, { name: f.name, fileName: f.fileName, headers: f.headers, emailColumn, rows: f.rows });
            saved++;
          }
        } catch (e) {
          throw new Error(`${messageOf(e, "Could not save a tab.")} ${saved === 0 ? "None were saved" : `${saved} of ${listable.length} were saved`}.`);
        }
      }
      setMade({
        files: files.map((f) => ({
          index: f.index,
          name: f.name,
          fileName: f.fileName,
          rows: f.rows.length,
          emailColumn: emailColumns.get(f.index) ?? null,
          savedAs: savedTo !== null && emailColumns.get(f.index) ? f.name : null,
        })),
        downloaded: toFiles,
        savedIn: savedTo,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the tabs.");
    } finally {
      setPending(false);
    }
  }

  /** Save first, then open. A failure leaves the picker as it was, with the reason shown. */
  async function saveThenOpen(open: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await open();
    } catch (e) {
      setError(messageOf(e, "Could not save this list."));
      setPending(false);
    }
  }

  async function submit() {
    // One tab is simply used. There is nothing to split, keep or stack.
    if (!several) {
      await saveThenOpen(() => onUse([...picked], { addSource }));
      return;
    }
    switch (mode) {
      case "files":
        await splitIntoFiles();
        return;
      case "workbook":
        await saveThenOpen(() => onKeep([...picked]));
        return;
      case "stack":
        await saveThenOpen(() => onUse([...picked], { addSource }));
        return;
      default: {
        const unreachable: never = mode;
        return unreachable;
      }
    }
  }

  /** A tab file is its own spreadsheet from here on, so sends are filed under its name, like its saved list. */
  function openTabFile(file: CreatedTabFile) {
    const tab = source.sheets[file.index];
    if (tab) onOpenTabFile(tab, file.fileName, file.savedAs);
  }

  function toggle(index: number) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <section aria-labelledby="tabs-title" className="max-w-3xl">
      <h2 id="tabs-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
        Choose the tabs to use
      </h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        <span className="font-medium text-ink">{source.fileName}</span> has {source.sheets.length} tabs. Pick one, or tick several and choose what to do with them.
      </p>

      <fieldset className="mt-5 space-y-2">
        <legend className="sr-only">Tabs in {source.fileName}</legend>
        {tabs.map((t) => (
          <label
            key={t.index}
            className="flex cursor-pointer items-start gap-3 rounded-stamp border border-line bg-sheet p-3.5 transition-colors hover:border-kite-ink has-[:checked]:border-postal has-[:checked]:bg-postal-wash"
          >
            <input type="checkbox" className="mt-1 accent-postal" checked={picked.has(t.index)} onChange={() => toggle(t.index)} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="truncate text-sm font-semibold">{t.sheet.name}</span>
                <span className="text-xs text-ink-2 tnum">{plural(t.sheet.rows.length, "row", "rows")}</span>
                {t.emailColumn ? (
                  <span className="text-xs text-sent tnum">
                    {plural(t.emails, "valid email", "valid emails")} in “{t.emailColumn}”
                  </span>
                ) : (
                  <span className="text-xs text-warn">No email column found</span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-3" title={t.sheet.headers.join(", ")}>
                {t.sheet.headers.join(" · ")}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {several ? (
        <fieldset className="mt-5 space-y-2 text-sm">
          <legend className="mb-1 font-medium">What should happen to the {chosen.length} ticked tabs?</legend>
          <ModeOption mode="files" current={mode} onPick={setMode} title="Save each tab as its own file">
            One Excel file and one saved list per tab. Next you choose which one to open.
          </ModeOption>
          <ModeOption mode="workbook" current={mode} onPick={setMode} title="Keep them together as one workbook">
            Stay in this Excel file and switch between its tabs in Selected file.
          </ModeOption>
          <ModeOption mode="stack" current={mode} onPick={setMode} title="Stack them into a single list">
            Put every row in one list, to email everyone at once.
          </ModeOption>
        </fieldset>
      ) : null}

      {splitting ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="truncate text-xs text-ink-3">
            e.g. {files[0]?.fileName}
            {files.length > 1 ? `, … ${files[files.length - 1]?.fileName}` : ""}
          </p>
          {canSave ? (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" className="mt-0.5 accent-postal" checked={alsoDownload} onChange={(e) => setAlsoDownload(e.target.checked)} />
              <span>
                <span className="font-medium">Also download them</span>
                <span className="block text-ink-3">One .xlsx per tab, together in a single zip.</span>
              </span>
            </label>
          ) : (
            <p className="text-ink-3">Saving is not available for this session, so the files are downloaded in a single zip.</p>
          )}
          {skipped > 0 ? (
            <p className="text-[13px] text-warn">
              {skipped === 1 ? "One tab has" : `${skipped} tabs have`} no email column, so {skipped === 1 ? "it is" : "they are"} not saved as a list.
            </p>
          ) : null}
          {nothingToSave ? <p className="text-[13px] text-warn">None of these tabs has an email column, so there is nothing to save. Tick “Also download them” to get the files.</p> : null}
          {clashes.length > 0 ? (
            <p role="alert" className="text-[13px] text-failed">
              {clashes.length === 1 ? `A list called “${clashes[0]?.name}” already exists.` : `${clashes.length} of these names already exist as lists.`} Delete or rename{" "}
              {clashes.length === 1 ? "it" : "them"} first so nothing is overwritten.
            </p>
          ) : null}
        </div>
      ) : null}

      {several && mode === "stack" ? (
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 accent-postal" checked={addSource} onChange={(e) => setAddSource(e.target.checked)} />
            <span>
              <span className="font-medium">Add a “Source tab” column</span>
              <span className="block text-ink-3">Each row says which tab it came from, and you can use it as a token like @sourcetab.</span>
            </span>
          </label>
          {differing ? (
            <p className="text-[13px] text-ink-2">These tabs do not have the same columns. Columns that share a name line up, and the rest are left blank for the other tabs.</p>
          ) : null}
          {capped ? <p className="text-[13px] text-warn">Only the first {MAX_ROWS.toLocaleString()} rows are kept.</p> : null}
        </div>
      ) : null}

      {updating !== null && (!several || mode !== "files") ? (
        <p className="mt-4 text-[13px] text-ink-2">
          This updates your saved list “{updating}”. It does not add a new one.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-[13px] text-failed">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={chosen.length === 0 || blocked} loading={pending} onClick={submit}>
          {chosen.length === 0
            ? "Pick at least one tab"
            : !several
              ? `Use “${chosen[0].sheet.name}”`
              : mode === "stack"
                ? `Use ${chosen.length} tabs (${plural(keptRows, "row", "rows")})`
                : `Use ${chosen.length} tabs`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Choose another file
        </Button>
      </div>

      {made ? (
        <TabFilesModal
          workbookName={source.fileName}
          files={made.files}
          downloaded={made.downloaded}
          savedIn={made.savedIn}
          stackedRows={keptRows}
          onOpen={openTabFile}
          onStack={() => void saveThenOpen(() => onUse([...picked], { addSource }))}
          onDone={onFinishSplit}
        />
      ) : null}
    </section>
  );
}
