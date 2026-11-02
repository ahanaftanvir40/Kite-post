"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputClass } from "@/components/ui/TextField";
import { keyOf } from "@/lib/db/types";
import {
  batchSizeProblem,
  batchSizes,
  batchToXlsx,
  createZip,
  DEFAULT_BATCH_SIZE,
  MIN_BATCH_SIZE,
  splitIntoBatches,
  type Row,
} from "@/lib/spreadsheet";
import { listLists, saveList } from "../api";
import { useActiveWorkspace } from "../hooks";
import { download } from "../download";
import { messageOf, useSavedItems } from "../saved";

interface Props {
  headers: string[];
  emailColumn: string;
  /** The rows to split, in order: the ones that are ready to send. */
  rows: Row[];
  /** The uploaded file name without its extension. */
  baseName: string;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Splits the ready rows into batches of a chosen size, then downloads them as Excel files and/or saves them in the workspace. */
export function BatchModal({ headers, emailColumn, rows, baseName, onClose }: Props) {
  const workspace = useActiveWorkspace();
  const canSave = workspace.ready && workspace.id !== null;
  const workspaceId = workspace.id ?? "";
  const { items: existing } = useSavedItems(() => listLists(workspaceId), canSave, workspaceId);

  const [sizeText, setSizeText] = useState(String(Math.min(DEFAULT_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, rows.length - 1))));
  const [name, setName] = useState(baseName);
  const [toFiles, setToFiles] = useState(true);
  const [toWorkspace, setToWorkspace] = useState(canSave);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const size = sizeText.trim() === "" ? Number.NaN : Number(sizeText);
  const sizeProblem = batchSizeProblem(size, rows.length);
  const counts = useMemo(() => (sizeProblem ? [] : batchSizes(rows.length, size)), [rows.length, size, sizeProblem]);
  const batches = useMemo(() => (sizeProblem ? [] : splitIntoBatches(rows, size, name)), [rows, size, name, sizeProblem]);

  const used = useMemo(() => new Set(existing.map((l) => keyOf(l.name))), [existing]);
  const clashes = toWorkspace ? batches.filter((b) => used.has(keyOf(b.name))) : [];
  const invalid = Boolean(sizeProblem) || name.trim() === "" || (!toFiles && !toWorkspace) || clashes.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid || pending) return;
    setPending(true);
    setError(null);
    const finished: string[] = [];
    try {
      if (toFiles) {
        const files = batches.map((b) => ({ name: b.fileName, data: batchToXlsx(headers, b.rows, b.name) }));
        const zipName = `${batches[0].name.replace(/ - batch 1 of \d+$/, "")} - batches.zip`;
        download(zipName, createZip(files), "application/zip");
        finished.push(`${plural(files.length, "Excel file", "Excel files")} downloaded in ${zipName}`);
      }
      if (toWorkspace && workspaceId) {
        let saved = 0;
        try {
          for (const b of batches) {
            await saveList(workspaceId, { name: b.name, fileName: b.fileName, headers, emailColumn, rows: b.rows });
            saved++;
          }
        } catch (e) {
          const first = saved === 0 ? "None were saved" : `${saved} of ${batches.length} were saved`;
          throw new Error(`${messageOf(e, "Could not save a batch.")} ${first}.${finished.length ? " The download already happened." : ""}`);
        }
        finished.push(`${plural(saved, "list", "lists")} saved in ${workspace.name ?? "the workspace"}`);
      }
      setDone(`${finished.join(". ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the batches.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <Modal title="Batches created" onClose={onClose}>
        <div className="space-y-4">
          <p role="status" className="text-sm text-ink-2">
            Split {plural(rows.length, "row", "rows")} into {plural(batches.length, "batch", "batches")}. {done}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose} data-autofocus>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const last = counts[counts.length - 1];
  const summary = sizeProblem
    ? sizeProblem
    : counts.length > 1 && last !== size
      ? `${plural(rows.length, "row", "rows")} become ${plural(counts.length, "batch", "batches")}: ${counts.length - 1} of ${size} and one of ${last}.`
      : `${plural(rows.length, "row", "rows")} become ${plural(counts.length, "batch", "batches")} of ${size}.`;

  return (
    <Modal title="Create batches" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">
          Splits the {plural(rows.length, "row", "rows")} that are ready to send, in the order you see them. Each batch keeps every column.
        </p>

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <label className="block text-sm font-medium">
            Rows per batch
            <input
              type="number"
              inputMode="numeric"
              min={MIN_BATCH_SIZE}
              step={1}
              className={`${inputClass} mt-1 h-9`}
              value={sizeText}
              aria-invalid={Boolean(sizeProblem) || undefined}
              aria-describedby="batch-summary"
              onChange={(e) => setSizeText(e.target.value)}
              data-autofocus
            />
          </label>
          <label className="block text-sm font-medium">
            Name
            <input className={`${inputClass} mt-1 h-9`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>

        <p id="batch-summary" role="status" className={`text-[13px] ${sizeProblem ? "text-failed" : "text-ink-2"}`}>
          {summary}
        </p>

        {batches.length > 0 ? (
          <p className="truncate text-xs text-ink-3">
            e.g. {batches[0].fileName}
            {batches.length > 1 ? `, … ${batches[batches.length - 1].fileName}` : ""}
          </p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="sr-only">Where to put the batches</legend>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-stamp border border-line p-3 text-sm has-[:checked]:border-postal has-[:checked]:bg-postal-wash">
            <input type="checkbox" className="mt-0.5 accent-postal" checked={toFiles} onChange={(e) => setToFiles(e.target.checked)} />
            <span>
              <span className="block font-medium">Download as Excel files</span>
              <span className="block text-ink-3">One .xlsx per batch, together in a single zip.</span>
            </span>
          </label>
          <label
            className={`flex items-start gap-2.5 rounded-stamp border border-line p-3 text-sm has-[:checked]:border-postal has-[:checked]:bg-postal-wash ${canSave ? "cursor-pointer" : "opacity-60"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5 accent-postal"
              checked={toWorkspace}
              disabled={!canSave}
              onChange={(e) => setToWorkspace(e.target.checked)}
            />
            <span>
              <span className="block font-medium">Save in {canSave ? (workspace.name ?? "this workspace") : "a workspace"}</span>
              <span className="block text-ink-3">
                {canSave ? "Each batch becomes its own saved list you can open later." : "Saving is not available for this session."}
              </span>
            </span>
          </label>
        </fieldset>

        {clashes.length > 0 ? (
          <p role="alert" className="text-[13px] text-failed">
            {clashes.length === 1 ? `A list called “${clashes[0].name}” already exists.` : `${clashes.length} of these names already exist as lists.`} Change the name
            above so nothing is overwritten.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] text-failed">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={invalid}>
            Create {batches.length > 0 ? plural(batches.length, "batch", "batches") : "batches"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
