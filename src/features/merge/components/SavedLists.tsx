"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteRunsForFile, deleteSaved, listLists, listRuns, loadList, markListDone, saveList, type RecipientListSummary, type RunSummary } from "../api";
import { useActiveWorkspace } from "../hooks";
import { fileKeyOf, groupLists, groupRunsByFile, listMeta, messageOf, tabChips, useSavedItems, workbookFromList, type FinishedList, type SentFile } from "../saved";
import { savableList, savableSignature, useMergeStore } from "../store";
import { keyOf } from "@/lib/db/types";
import { SavedEmpty, SavedRow, SavedShell, SaveForm } from "./SavedParts";
import { NeedsWorkspace } from "./WorkspaceNotice";
import { SaveListModal } from "./SaveListModal";
import { DoneAndSent } from "./SentFiles";
import { LoadingRows } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";

/** Lists saved earlier in the active workspace, shown on the empty Recipients screen. */
export function SavedLists() {
  const workspace = useActiveWorkspace();
  const { id: workspaceId, ready: enabled } = workspace;
  const loadWorkbook = useMergeStore((s) => s.loadWorkbook);
  const openSavedWorkbook = useMergeStore((s) => s.openSavedWorkbook);
  const listsStamp = useMergeStore((s) => s.listsStamp);
  const setStep = useMergeStore((s) => s.setStep);
  // The list whose rows are open now. Its name is kept while a file is loaded from or saved as it.
  const openName = useMergeStore((s) => (s.workbook ? s.savedListName : null));
  const isOpen = (name: string) => openName !== null && keyOf(name) === keyOf(openName);
  const { items, loading, error, reload } = useSavedItems<RecipientListSummary>(
    () => listLists(workspaceId ?? ""),
    enabled,
    workspaceId ?? "",
    listsStamp,
  );
  const runs = useSavedItems<RunSummary>(() => listRuns(workspaceId ?? ""), enabled, workspaceId ?? "", listsStamp);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sentFiles = useMemo(() => groupRunsByFile(runs.items), [runs.items]);
  const files = useMemo(() => new Map(sentFiles.map((f) => [fileKeyOf(f.fileName), f])), [sentFiles]);
  const groups = useMemo(() => groupLists(items, sentFiles), [items, sentFiles]);

  if (workspace.needsOne) return <NeedsWorkspace what="saved lists" />;
  if (!enabled || !workspaceId) return null;

  async function open(item: RecipientListSummary) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      const list = await loadList(workspaceId, item.id);
      const book = workbookFromList(list);
      if (list.tabs && list.tabs.length > 1) {
        // A workbook comes back whole, on its first tab, with the switcher for the rest.
        openSavedWorkbook(book, list.tabs.map((t) => t.emailColumn), list.name);
        return;
      }
      loadWorkbook(book);
      // Keep the column the person chose, even if auto-detection would pick another.
      const state = useMergeStore.getState();
      if (list.headers.includes(list.emailColumn)) state.setEmailColumn(list.emailColumn);
      // Saving again from here updates this list instead of making a copy.
      state.setSavedListName(list.name);
    } catch (e) {
      setActionError(messageOf(e, "Could not open that list."));
    } finally {
      setBusy(false);
    }
  }

  async function setDone(item: RecipientListSummary, done: boolean) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await markListDone(workspaceId, item.id, done);
      reload();
    } catch (e) {
      setActionError(messageOf(e, done ? "Could not mark that list as done." : "Could not move that list back."));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Delete a list, and the send history of its file when it has one. If that list is the one open now,
   * the open copy goes too: leaving it would show a "selected file" that no longer exists anywhere.
   */
  async function remove(list: RecipientListSummary, sent?: SentFile | null) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteSaved("lists", list.id, workspaceId);
      if (sent) await deleteRunsForFile(workspaceId, sent.fileName);
      const open = useMergeStore.getState();
      if (open.workbook && open.savedListName !== null && keyOf(open.savedListName) === keyOf(list.name)) open.clearWorkbook();
      // Wait for the new lists, so the row is gone by the time the spinner stops.
      await Promise.all([reload(), runs.reload()]);
    } catch (e) {
      setActionError(messageOf(e, "Could not delete that list."));
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: SentFile) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteRunsForFile(workspaceId, file.fileName);
      await runs.reload();
    } catch (e) {
      setActionError(messageOf(e, "Could not delete that file's history."));
    } finally {
      setBusy(false);
    }
  }

  const { todo } = groups;
  const waiting = loading || runs.loading;

  return (
    <>
    <SavedShell title="Saved lists" hint={`Spreadsheets saved in ${workspace.name ?? "this workspace"}.`}>
      {error ? (
        <p role="alert" className="text-[13px] text-failed">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-[13px] text-failed">
          {actionError}
        </p>
      ) : null}
      <ul aria-label="Saved lists" className="divide-y divide-line rounded-stamp border border-line bg-sheet">
        {waiting ? <li className="px-3 py-3"><LoadingRows label="Loading saved lists" /></li> : null}
        {!waiting && items.length === 0 && !error ? <SavedEmpty>No saved lists in this workspace yet. Upload one and choose Save list.</SavedEmpty> : null}
        {!waiting && items.length > 0 && todo.length === 0 ? <SavedEmpty>Every saved list is marked as done.</SavedEmpty> : null}
        {(waiting ? [] : todo).map((l) => (
          <SavedRow
            key={l.id}
            title={l.name}
            meta={listMeta(l, files.get(fileKeyOf(l.fileName ?? "")) ?? null)}
            tabs={tabChips(l, files.get(fileKeyOf(l.fileName ?? "")) ?? null)}
            selected={isOpen(l.name)}
            badge={isOpen(l.name) ? <Badge tone="postal">Selected</Badge> : null}
            // Opening again would reload it and drop edits, so the open one just goes to its tab.
            actionLabel={isOpen(l.name) ? "View" : "Open"}
            quietAction={isOpen(l.name)}
            onAction={() => (isOpen(l.name) ? setStep("selected") : void open(l))}
            extra={{
              label: "Mark done",
              hint: "Move to Already done or sent",
              icon: <Check className="size-4" aria-hidden />,
              onClick: () => void setDone(l, true),
            }}
            deleteLabel={`Delete list ${l.name}`}
            onDelete={() => remove(l)}
            busy={busy}
          />
        ))}
      </ul>
    </SavedShell>
    <div className="mt-8">
      <DoneAndSent
        workspaceName={workspace.name}
        finished={waiting ? [] : groups.finished}
        loose={waiting ? [] : groups.loose}
        openName={openName}
        onView={() => setStep("selected")}
        loading={waiting}
        error={runs.error}
        busy={busy}
        onOpen={(f: FinishedList) => void open(f.list)}
        onRestore={(f: FinishedList) => void setDone(f.list, false)}
        onDelete={(f: FinishedList) => remove(f.list, f.sent)}
        onDeleteFile={(file) => removeFile(file)}
      />
    </div>
    </>
  );
}

/** Save the sheet that is loaded now. Shown above the recipients table. */
export function SaveListForm() {
  const workspace = useActiveWorkspace();
  const { id: workspaceId, ready: enabled } = workspace;
  const store = useMergeStore();
  const list = savableList(store);
  const listsStamp = useMergeStore((s) => s.listsStamp);
  const { items, reload } = useSavedItems<RecipientListSummary>(() => listLists(workspaceId ?? ""), enabled, workspaceId ?? "", listsStamp);
  const [asking, setAsking] = useState<string | null>(null);
  const [done, setDone] = useState<{ list: string; text: string } | null>(null);
  const signature = useMemo(() => (list ? savableSignature(list) : null), [list]);
  if (workspace.needsOne && list && store.workbook) return <NeedsWorkspace what="this list" />;
  if (!enabled || !workspaceId || !list || !store.workbook) return null;
  const { workbook, savedListName } = store;
  const toSave = list;
  const rowTotal = list.tabs ? list.tabs.reduce((sum, t) => sum + t.rows.length, 0) : list.rows.length;
  const fileBase = workbook.fileName.replace(/\.[^.]+$/, "");
  const taken = [...new Set([...items.map((l) => l.name), ...(savedListName ? [savedListName] : [])])];

  async function write(name: string, text: string) {
    await saveList(workspaceId ?? "", { name, fileName: workbook.fileName, ...toSave });
    store.setSavedListName(name);
    setDone({ list: name, text });
    reload();
  }

  return (
    <div className="max-w-md">
      <SaveForm
        key={`${workspaceId}:${workbook.fileName}:${savedListName ?? ""}`}
        label={savedListName ? `Saved as “${savedListName}”` : `Save this list in ${workspace.name ?? "this workspace"}`}
        placeholder={fileBase || "My list"}
        initialName={savedListName ?? fileBase}
        buttonLabel={savedListName ? "Update list" : "Save list"}
        // Nothing to save while the sheet matches the saved list and the name is unchanged.
        disabledFor={(name) =>
          savedListName !== null && keyOf(name) === keyOf(savedListName) && signature === store.savedSignature
        }
        onSave={async (name) => {
          // A name that is already in use would overwrite that list, so ask first.
          if (taken.some((t) => keyOf(t) === keyOf(name))) {
            setAsking(name);
            return "skipped";
          }
          await write(name, "Saved.");
          return "skipped";
        }}
      />
      {done && done.list === savedListName ? (
        <p role="status" className="mt-1.5 text-[13px] text-sent">
          {done.text}
        </p>
      ) : null}
      {asking ? (
        <SaveListModal
          existing={taken.find((t) => keyOf(t) === keyOf(asking)) ?? asking}
          taken={taken}
          rowCount={rowTotal}
          onClose={() => setAsking(null)}
          onConfirm={async (name) => {
            const replaced = taken.some((t) => keyOf(t) === keyOf(name));
            await write(name, replaced ? "List updated." : "Saved as a new list. The original is unchanged.");
            setAsking(null);
          }}
        />
      ) : null}
    </div>
  );
}
