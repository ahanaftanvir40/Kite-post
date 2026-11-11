"use client";

import { ArrowLeft, Check, Layers, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { batchBaseName, isCombinedSheet, ISSUE_LABEL, MAX_ROWS, MIN_BATCH_SIZE, type RowIssue } from "@/lib/spreadsheet";
import { useActiveWorkspace } from "../hooks";
import { listLists, listRuns, type RecipientListSummary, type RunSummary } from "../api";
import { fileKeyOf, groupRunsByFile, tabProgress, useSavedItems } from "../saved";
import { activeSheet, isBlocked, sendableRecipients, useMergeStore } from "../store";
import { AddRowForm } from "./AddRowForm";
import { BatchModal } from "./BatchModal";
import { SaveListForm } from "./SavedLists";

/**
 * The file that is open: its rows, who will get the email, and what can be done to the list.
 * It has its own tab beside Recipients, which stays the place where a file is chosen.
 */
export function SelectedFilePanel() {
  const store = useMergeStore();
  const { workbook, tabSource, workbookTabs, activeTab, recipients, excluded, emailColumn } = store;
  const sheet = activeSheet(store);
  const ready = sendableRecipients(store).length;

  const root = useRef<HTMLDivElement>(null);
  const [batching, setBatching] = useState(false);

  // Which tabs of a kept workbook have been sent from, read from send history. Quiet when saving is off.
  const workspace = useActiveWorkspace();
  const scope = workspace.id ?? "";
  const lists = useSavedItems<RecipientListSummary>(() => listLists(scope), workspace.ready && workbookTabs !== null, scope);
  const runs = useSavedItems<RunSummary>(() => listRuns(scope), workspace.ready && workbookTabs !== null, scope);
  const sentTabs = (() => {
    if (!workbookTabs || !tabSource || !store.savedListName) return new Set<string>();
    const list = lists.items.find((l) => l.name.toLowerCase() === store.savedListName?.toLowerCase());
    const file = groupRunsByFile(runs.items).find((f) => fileKeyOf(f.fileName) === fileKeyOf(tabSource.fileName));
    const names = workbookTabs.map((i) => tabSource.sheets[i]?.name ?? "");
    return new Set(list ? (tabProgress({ tabNames: names, updatedAt: list.updatedAt }, file)?.done ?? []) : []);
  })();

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

  if (!workbook) return null;

  return (
    <div ref={root} className="space-y-6">
      <section aria-labelledby="file-title" className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => store.setStep("recipients")}
            className="-ml-1 mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-stamp px-1 py-0.5 max-sm:py-3 text-sm text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to recipients
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <h2 id="file-title" className="min-w-0 font-display text-2xl font-semibold tracking-[-0.025em]">
              <span className="block truncate">{workbookTabs && tabSource ? tabSource.fileName : workbook.fileName}</span>
            </h2>
            <button
              type="button"
              onClick={store.clearWorkbook}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-line bg-sheet px-2.5 py-1 max-sm:py-2 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <X className="size-3.5" aria-hidden /> Deselect file
            </button>
          </div>
          {workbookTabs ? (
            <p className="text-sm text-ink-3">
              {sheet?.name} · tab {workbookTabs.indexOf(activeTab) + 1} of {workbookTabs.length}
            </p>
          ) : tabSource ? (
            <p className="text-sm text-ink-3">
              {sheet?.name} · from {tabSource.sheets.length} tabs
            </p>
          ) : null}
          <p role="status" className="text-sm text-ink-2 tnum">
            {ready} of {recipients.length} ready to send
            {sheet?.truncated ? `. Only the first ${MAX_ROWS.toLocaleString()} rows were read.` : ""}
          </p>
        </div>

        <label className="text-sm max-sm:w-full">
          <span className="mb-1 block font-medium">Email column</span>
          <Select
            className="w-48 max-sm:w-full"
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

      </section>

      {workbookTabs && tabSource ? (
        <div role="group" aria-label={`Tabs in ${tabSource.fileName}`} className="-mt-2 flex flex-wrap gap-1.5">
          {workbookTabs.map((i) => {
            const tab = tabSource.sheets[i];
            const current = i === activeTab;
            const sent = tab ? sentTabs.has(tab.name) : false;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={current}
                onClick={() => store.switchTab(i)}
                className={`inline-flex h-9 max-sm:h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-200 ${
                  current ? "border-kite-ink bg-kite-ink font-medium text-white" : "border-line-strong bg-sheet text-ink hover:border-kite-ink"
                }`}
              >
                {sent ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                <span className="truncate">{tab?.name}</span>
                {sent ? <span className="sr-only">, completed</span> : null}
                <span className={`text-xs tnum ${current ? "text-white/70" : "text-ink-3"}`}>{tab?.rows.length ?? 0}</span>
              </button>
            );
          })}
        </div>
      ) : null}

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
              baseName={batchBaseName(workbook.fileName, sheet, tabSource !== null && workbookTabs === null && !isCombinedSheet(sheet))}
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
                          className="size-4 max-sm:size-5 cursor-pointer accent-postal disabled:cursor-not-allowed"
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
                          className="grid size-7 max-sm:size-10 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-failed-wash hover:text-failed"
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
    </div>
  );
}
