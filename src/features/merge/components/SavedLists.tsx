"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteRunsForFile, deleteSaved, listLists, listRuns, loadList, markListDone, saveList, type RecipientListSummary, type RunSummary } from "../api";
import { useActiveWorkspace } from "../hooks";
import { formatWhen, groupLists, groupRunsByFile, messageOf, useSavedItems, workbookFromList, type FinishedList, type SentFile } from "../saved";
import { activeSheet, listSignature, useMergeStore } from "../store";
import { keyOf } from "@/lib/db/types";
import { SavedEmpty, SavedRow, SavedShell, SaveForm } from "./SavedParts";
import { NeedsWorkspace } from "./WorkspaceNotice";
import { SaveListModal } from "./SaveListModal";
import { DoneAndSent } from "./SentFiles";

/** Lists saved earlier in the active workspace, shown on the empty Recipients screen. */
export function SavedLists() {
  const workspace = useActiveWorkspace();
  const { id: workspaceId, ready: enabled } = workspace;
  const loadWorkbook = useMergeStore((s) => s.loadWorkbook);
  const { items, loading, error, reload } = useSavedItems<RecipientListSummary>(
    () => listLists(workspaceId ?? ""),
    enabled,
    workspaceId ?? "",
  );
  const runs = useSavedItems<RunSummary>(() => listRuns(workspaceId ?? ""), enabled, workspaceId ?? "");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const groups = useMemo(() => groupLists(items, groupRunsByFile(runs.items)), [items, runs.items]);

  if (workspace.needsOne) return <NeedsWorkspace what="saved lists" />;
  if (!enabled || !workspaceId) return null;

  async function open(item: RecipientListSummary) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      const list = await loadList(workspaceId, item.id);
      loadWorkbook(workbookFromList(list));
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

  /** Delete a list, and the send history of its file when it has one. */
  async function remove(id: string, sent?: SentFile | null) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteSaved("lists", id, workspaceId);
      if (sent) await deleteRunsForFile(workspaceId, sent.fileName);
      reload();
      runs.reload();
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
      runs.reload();
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
        {waiting ? <SavedEmpty>Loading…</SavedEmpty> : null}
        {!waiting && items.length === 0 && !error ? <SavedEmpty>No saved lists in this workspace yet. Upload one and choose Save list.</SavedEmpty> : null}
        {!waiting && items.length > 0 && todo.length === 0 ? <SavedEmpty>Every saved list is marked as done.</SavedEmpty> : null}
        {(waiting ? [] : todo).map((l) => (
          <SavedRow
            key={l.id}
            title={l.name}
            meta={`${l.rowCount} ${l.rowCount === 1 ? "row" : "rows"} · ${formatWhen(l.updatedAt)}`}
            actionLabel="Open"
            onAction={() => void open(l)}
            extra={{
              label: "Mark done",
              hint: "Move to Already done or sent",
              icon: <Check className="size-4" aria-hidden />,
              onClick: () => void setDone(l, true),
            }}
            deleteLabel={`Delete list ${l.name}`}
            onDelete={() => void remove(l.id)}
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
        loading={waiting}
        error={runs.error}
        busy={busy}
        onOpen={(f: FinishedList) => void open(f.list)}
        onRestore={(f: FinishedList) => void setDone(f.list, false)}
        onDelete={(f: FinishedList) => void remove(f.list.id, f.sent)}
        onDeleteFile={(file) => void removeFile(file)}
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
  const sheet = activeSheet(store);
  const { items, reload } = useSavedItems<RecipientListSummary>(() => listLists(workspaceId ?? ""), enabled, workspaceId ?? "");
  const [asking, setAsking] = useState<string | null>(null);
  const [done, setDone] = useState<{ list: string; text: string } | null>(null);
  const signature = useMemo(
    () => (sheet && store.emailColumn ? listSignature(sheet, store.emailColumn) : null),
    [sheet, store.emailColumn],
  );
  if (workspace.needsOne && sheet && store.emailColumn && store.workbook) return <NeedsWorkspace what="this list" />;
  if (!enabled || !workspaceId || !sheet || !store.emailColumn || !store.workbook) return null;
  const { emailColumn, workbook, savedListName } = store;
  const { headers, rows } = sheet;
  const fileBase = workbook.fileName.replace(/\.[^.]+$/, "");
  const taken = [...new Set([...items.map((l) => l.name), ...(savedListName ? [savedListName] : [])])];

  async function write(name: string, text: string) {
    await saveList(workspaceId ?? "", { name, fileName: workbook.fileName, headers, emailColumn, rows });
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
          rowCount={rows.length}
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
