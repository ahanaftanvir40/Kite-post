"use client";

import { ArrowRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/Button";
import { MAX_ROWS, parseSpreadsheetFile, SAMPLE_CSV, SpreadsheetError } from "@/lib/spreadsheet";
import { saveKeptWorkbook, saveSheet, saveStackedTabs } from "../autosave";
import { messageOf } from "../saved";
import { sendableRecipients, useMergeStore } from "../store";
import { TabPicker } from "./TabPicker";
import { SavedLists } from "./SavedLists";

const ACCEPT = ".xlsx,.xls,.csv";

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "kitepost-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Where a file is chosen: upload one, pick tabs, or open a saved list. Once a file is loaded it lives
 * on its own tab (see SelectedFilePanel), and this screen only points back to it.
 */
export function RecipientsPanel() {
  const store = useMergeStore();
  const { workbook, tabSource, tabChoice, recipients } = store;
  const ready = sendableRecipients(store).length;

  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const parsed = await parseSpreadsheetFile(file);
      // A file with one tab is saved before it opens. One with several waits for the tab choice.
      const sheet = parsed.sheets.length === 1 ? parsed.sheets[0] : undefined;
      const name = sheet ? await saveSheet(parsed.fileName, sheet, null) : null;
      store.loadWorkbook(parsed);
      if (name !== null) store.setSavedListName(name);
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : messageOf(e, "That file could not be read."));
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

  if (!workbook && tabSource) {
    return (
      <TabPicker
        key={tabSource.fileName}
        source={tabSource}
        initial={tabChoice}
        onUse={async (indices, options) => {
          // Saved before it opens, like a file with one tab. A failure shows on the picker.
          const name = await saveStackedTabs(tabSource, indices, options.addSource, store.changingList);
          store.chooseTabs(indices, options);
          if (name !== null) store.setSavedListName(name);
        }}
        onKeep={async (indices) => {
          // Saved before it opens, so the list is already in Saved lists and a failure shows on the picker.
          const name = await saveKeptWorkbook(tabSource, indices, store.changingList);
          store.keepTabs(indices);
          if (name !== null) store.setSavedListName(name);
        }}
        onOpenTabFile={(tab, fileName, savedAs) => {
          store.loadWorkbook({ fileName, sheets: [tab] });
          // Already saved with the tabs, so it must not be saved again under another name.
          if (savedAs) store.setSavedListName(savedAs);
        }}
        // The tabs are already split and saved, so there is nothing left to pick: show the saved lists.
        onFinishSplit={store.clearWorkbook}
        onCancel={store.clearWorkbook}
        updating={store.changingList}
      />
    );
  }

  return (
    <section aria-labelledby="upload-title" className="max-w-2xl">
      <h2 id="upload-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
        Add your recipients
      </h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        One row per person. The first row holds column names, and each name becomes a token you can write as
        <span className="mx-1 font-mono text-[13px]">@columnname</span>. The file is read in your browser and never uploaded.
      </p>

      {workbook ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-stamp border border-line bg-sheet px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-postal-wash text-postal">
            <FileSpreadsheet className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{workbook.fileName}</p>
            <p className="text-[13px] text-ink-2 tnum">
              {ready} of {recipients.length} ready to send. Choosing another file replaces it.
            </p>
          </div>
          <Button variant="secondary" onClick={() => store.setStep("selected")} icon={<ArrowRight className="size-4" aria-hidden />}>
            View selected file
          </Button>
        </div>
      ) : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mt-5 rounded-2xl border-2 border-dashed p-1.5 transition-colors duration-200 ${dragging ? "border-postal bg-postal-wash" : "border-line-strong bg-sheet"}`}
      >
        <div className="grid place-items-center gap-3 px-6 py-12 text-center max-sm:px-4 max-sm:py-8">
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
        className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-sm max-sm:py-3 text-postal underline hover:text-postal-deep"
      >
        <Download className="size-4" aria-hidden /> Download a sample file
      </button>
      <div className="mt-8 border-t border-line pt-6">
        <SavedLists />
      </div>
    </section>
  );
}
