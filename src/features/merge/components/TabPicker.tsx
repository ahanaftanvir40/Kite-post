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

interface Props {
  source: ParsedWorkbook;
  /** Tabs ticked when the picker opens. */
  initial?: number[];
  onUse: (indices: number[], options: { addSource: boolean }) => void;
  onCancel: () => void;
}

interface TabInfo {
  index: number;
  sheet: SheetData;
  emailColumn: string | null;
  emails: number;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function describe(sheet: SheetData, index: number): TabInfo {
  const emailColumn = detectEmailColumn(sheet.headers, sheet.rows);
  const emails = emailColumn ? sheet.rows.filter((r) => isValidEmail(r[emailColumn] ?? "")).length : 0;
  return { index, sheet, emailColumn, emails };
}

/** Shown after uploading a file with several tabs: choose which to use, and whether to stack them. */
export function TabPicker({ source, initial, onUse, onCancel }: Props) {
  const tabs = useMemo(() => source.sheets.map(describe), [source]);
  const [picked, setPicked] = useState<Set<number>>(() => {
    if (initial && initial.length > 0) return new Set(initial);
    // Start with the first tab that looks like a list of people.
    const first = tabs.find((t) => t.emailColumn !== null);
    return new Set(first ? [first.index] : []);
  });
  const [addSource, setAddSource] = useState(true);

  const workspace = useActiveWorkspace();
  const canSave = workspace.ready && workspace.id !== null;
  const workspaceId = workspace.id ?? "";
  const { items: existing } = useSavedItems(() => listLists(workspaceId), canSave, workspaceId);
  const [split, setSplit] = useState(false);
  const [toFiles, setToFiles] = useState(true);
  const [toWorkspace, setToWorkspace] = useState(canSave);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = tabs.filter((t) => picked.has(t.index));
  const totalRows = chosen.reduce((sum, t) => sum + t.sheet.rows.length, 0);
  const keptRows = Math.min(totalRows, MAX_ROWS);
  const differing = chosen.length > 1 && unionHeaders(chosen.map((t) => t.sheet)).length > Math.max(...chosen.map((t) => t.sheet.headers.length));
  const capped = chosen.length > 1 && totalRows > MAX_ROWS;

  const files = tabFiles(source.fileName, chosen.map((t) => ({ index: t.index, sheet: t.sheet })));
  const emailColumns = new Map(tabs.map((t) => [t.index, t.emailColumn]));
  // A saved list needs an email column, so tabs without one can only be downloaded.
  const listable = files.filter((f) => emailColumns.get(f.index));
  const used = new Set(existing.map((l) => keyOf(l.name)));
  const clashes = split && toWorkspace ? listable.filter((f) => used.has(keyOf(f.name))) : [];
  const skipped = split && toWorkspace ? files.length - listable.length : 0;
  const splitInvalid = split && (!toFiles && !toWorkspace || clashes.length > 0 || (!toFiles && listable.length === 0));

  async function submit() {
    if (!split) {
      onUse([...picked], { addSource });
      return;
    }
    if (splitInvalid || pending) return;
    setPending(true);
    setError(null);
    try {
      if (toFiles) {
        const made = files.map((f) => ({ name: f.fileName, data: batchToXlsx(f.headers, f.rows, f.name) }));
        const first = made[0];
        if (made.length === 1 && first) download(first.name, first.data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        else download(`${source.fileName.replace(/\.[^.]+$/, "")} - tabs.zip`, createZip(made), "application/zip");
      }
      if (toWorkspace && workspaceId) {
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
      onUse([...picked], { addSource });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the tabs.");
    } finally {
      setPending(false);
    }
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
        <span className="font-medium text-ink">{source.fileName}</span> has {source.sheets.length} tabs. Pick one, or tick several to stack them into a single list.
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

      {chosen.length > 1 ? (
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

      {chosen.length > 0 ? (
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-0.5 accent-postal" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            <span>
              <span className="font-medium">Also save {chosen.length === 1 ? "this tab" : "each ticked tab"} as its own Excel file</span>
              <span className="block text-ink-3">{chosen.length === 1 ? "A separate .xlsx with just this tab." : "One .xlsx per tab, each with only that tab’s rows."}</span>
            </span>
          </label>
          {split ? (
            <fieldset className="ml-6 space-y-2">
              <p className="truncate text-xs text-ink-3">
                e.g. {files[0]?.fileName}
                {files.length > 1 ? `, … ${files[files.length - 1]?.fileName}` : ""}
              </p>
              <legend className="sr-only">Where to put the tab files</legend>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 accent-postal" checked={toFiles} onChange={(e) => setToFiles(e.target.checked)} />
                <span>
                  <span className="font-medium">Download {files.length === 1 ? "it" : "them"}</span>
                  <span className="block text-ink-3">{files.length === 1 ? "An .xlsx file." : "One .xlsx per tab, together in a single zip."}</span>
                </span>
              </label>
              <label className={`flex items-start gap-2.5 ${canSave ? "cursor-pointer" : "opacity-60"}`}>
                <input type="checkbox" className="mt-0.5 accent-postal" checked={toWorkspace} disabled={!canSave} onChange={(e) => setToWorkspace(e.target.checked)} />
                <span>
                  <span className="font-medium">Save in {canSave ? (workspace.name ?? "this workspace") : "a workspace"}</span>
                  <span className="block text-ink-3">{canSave ? "Each tab becomes its own saved list." : "Saving is not available for this session."}</span>
                </span>
              </label>
              {skipped > 0 ? (
                <p className="text-[13px] text-warn">
                  {skipped === 1 ? "One tab has" : `${skipped} tabs have`} no email column, so {skipped === 1 ? "it is" : "they are"} not saved as a list.
                </p>
              ) : null}
              {clashes.length > 0 ? (
                <p role="alert" className="text-[13px] text-failed">
                  {clashes.length === 1 ? `A list called “${clashes[0]?.name}” already exists.` : `${clashes.length} of these names already exist as lists.`} Delete or
                  rename {clashes.length === 1 ? "it" : "them"} first so nothing is overwritten.
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] text-failed">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={chosen.length === 0 || splitInvalid} loading={pending} onClick={submit}>
          {chosen.length === 0
            ? "Pick at least one tab"
            : chosen.length === 1
              ? `Use “${chosen[0].sheet.name}”`
              : `Use ${chosen.length} tabs (${plural(keptRows, "row", "rows")})`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Choose another file
        </Button>
      </div>
    </section>
  );
}
