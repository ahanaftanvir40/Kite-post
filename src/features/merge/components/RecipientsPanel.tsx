"use client";

import { ArrowLeft, Download, FileSpreadsheet, Layers, Trash2, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import {
  batchBaseName,
  isCombinedSheet,
  ISSUE_LABEL,
  MAX_ROWS,
  MIN_BATCH_SIZE,
  parseSpreadsheetFile,
  SAMPLE_CSV,
  SpreadsheetError,
  type RowIssue,
} from "@/lib/spreadsheet";
import { activeSheet, isBlocked, sendableRecipients, useMergeStore } from "../store";
import { AddRowForm } from "./AddRowForm";
import { BatchModal } from "./BatchModal";
import { TabPicker } from "./TabPicker";
import { SavedLists, SaveListForm } from "./SavedLists";

const ACCEPT = ".xlsx,.xls,.csv";

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "kitepost-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function RecipientsPanel() {
  const store = useMergeStore();
  const { workbook, tabSource, tabChoice, recipients, excluded, emailColumn } = store;
  const sheet = activeSheet(store);
  const ready = sendableRecipients(store).length;

  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [batching, setBatching] = useState(false);

  useMotion(
    ({ reduce }) => {
      if (reduce || !workbook) return;
      gsap.from(".recipient-row", {
        autoAlpha: 0,
        y: 6,
        duration: 0.35,
        ease: EASE_OUT,
        stagger: { each: 0.015, amount: 0.4 },
        clearProps: "all",
      });
    },
    { scope: root, dependencies: [workbook, emailColumn] },
  );

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      store.loadWorkbook(await parseSpreadsheetFile(file));
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : "That file could not be read.");
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void take(event.dataTransfer.files[0]);
  }

  return (
    <div ref={root} className="space-y-6">
      {!workbook && tabSource ? (
        <TabPicker
          key={tabSource.fileName}
          source={tabSource}
          initial={tabChoice}
          onUse={store.chooseTabs}
          onCancel={store.clearWorkbook}
        />
      ) : !workbook ? (
        <section aria-labelledby="upload-title" className="max-w-2xl">
          <h2 id="upload-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
            Add your recipients
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-2">
            One row per person. The first row holds column names, and each name becomes a token you can write as
            <span className="mx-1 font-mono text-[13px]">@columnname</span>. The file is read in your browser and never uploaded.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-5 rounded-2xl border-2 border-dashed p-1.5 transition-colors duration-200 ${dragging ? "border-postal bg-postal-wash" : "border-line-strong bg-sheet"}`}
          >
            <div className="grid place-items-center gap-3 px-6 py-12 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-postal-wash text-postal">
                <FileSpreadsheet className="size-7" aria-hidden />
              </span>
              <p className="font-medium">{dragging ? "Drop it here" : "Drop an Excel or CSV file"}</p>
              <p className="text-sm text-ink-3">.xlsx, .xls or .csv, up to 5 MB and {MAX_ROWS.toLocaleString()} rows</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" loading={loading} onClick={() => input.current?.click()} icon={<Upload className="size-4" aria-hidden />}>
                  Choose a file
                </Button>
                <Button variant="ghost" onClick={store.loadSample}>
                  Try the sample data
                </Button>
              </div>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                aria-label="Upload spreadsheet"
                tabIndex={-1}
                onChange={(e) => void take(e.target.files?.[0])}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-failed">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={downloadSample}
            className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm text-postal underline hover:text-postal-deep"
          >
            <Download className="size-4" aria-hidden /> Download a sample file
          </button>
          <div className="mt-8 border-t border-line pt-6">
            <SavedLists />
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="file-title" className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={store.clearWorkbook}
                className="-ml-1 mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-stamp px-1 py-0.5 text-sm text-ink-2 transition-colors hover:text-ink"
              >
                <ArrowLeft className="size-4" aria-hidden /> Back to recipients
              </button>
              <h2 id="file-title" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-[-0.025em]">
                <span className="truncate">{workbook.fileName}</span>
              </h2>
              {tabSource ? (
                <p className="text-sm text-ink-3">
                  {sheet?.name} · from {tabSource.sheets.length} tabs
                </p>
              ) : null}
              <p role="status" className="text-sm text-ink-2 tnum">
                {ready} of {recipients.length} ready to send
                {sheet?.truncated ? `. Only the first ${MAX_ROWS.toLocaleString()} rows were read.` : ""}
              </p>
            </div>

            <label className="text-sm">
              <span className="mb-1 block font-medium">Email column</span>
              <Select
                className="w-48"
                aria-label="Email column"
                value={emailColumn ?? ""}
                onChange={store.setEmailColumn}
                options={[
                  ...(emailColumn === null ? [{ value: "", label: "Choose a column" }] : []),
                  ...(sheet?.headers.map((h) => ({ value: h, label: h })) ?? []),
                ]}
              />
            </label>

            {tabSource ? (
              <Button variant="secondary" onClick={store.changeTabs} icon={<Layers className="size-4" aria-hidden />}>
                Change tabs
              </Button>
            ) : null}

            <Button variant="ghost" onClick={store.clearWorkbook} icon={<X className="size-4" aria-hidden />}>
              Remove file
            </Button>
          </section>

          {emailColumn === null ? (
            <p role="alert" className="rounded-stamp bg-warn-wash px-3 py-2.5 text-sm text-warn">
              No column looks like email addresses. Choose the right one above.
            </p>
          ) : (
            <>
              <SaveListForm />

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button variant="secondary" onClick={() => store.setAllIncluded(true)}>
                  Include all valid rows
                </Button>
                <Button variant="ghost" onClick={() => store.setAllIncluded(false)}>
                  Exclude all
                </Button>
                <Button
                  variant="secondary"
                  disabled={ready <= MIN_BATCH_SIZE}
                  onClick={() => setBatching(true)}
                  icon={<Layers className="size-4" aria-hidden />}
                >
                  Create batches
                </Button>
                <Button
                  variant="ghost"
                  disabled={recipients.every((r) => !excluded.has(r.id))}
                  onClick={() => store.removeRows(recipients.filter((r) => excluded.has(r.id)).map((r) => r.id))}
                  icon={<Trash2 className="size-4" aria-hidden />}
                >
                  Remove unchecked rows
                </Button>
                <span className="text-ink-3">Flagged rows start excluded. Removed rows are dropped from the saved list too.</span>
              </div>

              <AddRowForm />

              {batching && sheet ? (
                <BatchModal
                  headers={sheet.headers}
                  emailColumn={emailColumn}
                  rows={sendableRecipients(store)
                    .map((r) => sheet.rows[Number(r.id.slice(1))])
                    .filter((row) => row !== undefined)}
                  baseName={batchBaseName(workbook.fileName, sheet, tabSource !== null && !isCombinedSheet(sheet))}
                  onClose={() => setBatching(false)}
                />
              ) : null}

              <div className="max-h-[28rem] overflow-auto rounded-stamp border border-line bg-sheet">
                <table className="w-full min-w-max border-collapse text-left text-sm tnum">
                  <caption className="sr-only">Recipients from {workbook.fileName}</caption>
                  <thead className="sticky top-0 z-10 bg-sunk text-xs text-ink-2">
                    <tr>
                      <th scope="col" className="w-12 px-3 py-2 font-medium">
                        Send
                      </th>
                      <th scope="col" className="w-14 px-3 py-2 font-medium">
                        #
                      </th>
                      {sheet?.headers.map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 font-medium">
                        Status
                      </th>
                      <th scope="col" className="w-10 px-3 py-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r, position) => {
                      const out = excluded.has(r.id);
                      const blocked = isBlocked(r);
                      const row = sheet?.rows[Number(r.id.slice(1))];
                      return (
                        <tr key={r.id} className={`recipient-row border-t border-line ${out ? "text-ink-3" : ""}`}>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer accent-postal disabled:cursor-not-allowed"
                              checked={!out}
                              disabled={blocked}
                              onChange={() => store.toggleExcluded(r.id)}
                              aria-label={`Send to ${r.email || `row ${position + 1}`}`}
                            />
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-ink-3">{position + 1}</td>
                          {sheet?.headers.map((h) => (
                            <td key={h} className="max-w-64 truncate px-3 py-1.5">
                              {row?.[h] || <span className="text-ink-3">empty</span>}
                            </td>
                          ))}
                          <td className="px-3 py-1.5">
                            <div className="flex gap-1">
                              {r.issues.length === 0 ? <Badge tone="sent">Ready</Badge> : null}
                              {r.issues.map((issue: RowIssue) => (
                                <Badge key={issue} tone={issue === "duplicate" ? "warn" : "failed"}>
                                  {ISSUE_LABEL[issue]}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <button
                              type="button"
                              aria-label={`Remove ${r.email || `row ${position + 1}`}`}
                              onClick={() => store.removeRows([r.id])}
                              className="grid size-7 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-failed-wash hover:text-failed"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <Button variant="primary" disabled={ready === 0} onClick={() => store.setStep("compose")}>
                  Continue to compose
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
