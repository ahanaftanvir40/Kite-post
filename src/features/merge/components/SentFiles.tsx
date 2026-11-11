"use client";

import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatWhen, tabChips, type FinishedList, type SentFile } from "../saved";
import { keyOf } from "@/lib/db/types";
import { useMergeStore } from "../store";
import { SavedRow, SavedShell } from "./SavedParts";
import { LoadingRows } from "@/components/ui/Skeleton";

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

interface Props {
  workspaceName: string | null;
  /** Saved lists that are finished: marked as done, or sent from since they were last saved. */
  finished: FinishedList[];
  /** Spreadsheets that were sent from but have no saved list. */
  loose: SentFile[];
  /** Name of the saved list that is open now, if any, so its row can say so. */
  openName: string | null;
  /** Go to the open file, instead of reloading it. */
  onView: () => void;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onOpen: (list: FinishedList) => void;
  onRestore: (list: FinishedList) => void;
  onDelete: (list: FinishedList) => void | Promise<void>;
  onDeleteFile: (file: SentFile) => void | Promise<void>;
}

/**
 * Everything that is finished with, beside the saved lists. Lists can be opened, moved back
 * to Saved lists, or deleted. Files with no saved list can be deleted, which clears their history.
 */
export function DoneAndSent({ workspaceName, finished, loose, openName, onView, loading, error, busy, onOpen, onRestore, onDelete, onDeleteFile }: Props) {
  const setStep = useMergeStore((s) => s.setStep);

  // Nothing to say until a list is finished or a file is sent. An empty box would only add noise.
  if (!loading && !error && finished.length === 0 && loose.length === 0) return null;

  return (
    <SavedShell title="Already done or sent" hint={`Lists you marked as done and spreadsheets already sent from in ${workspaceName ?? "this workspace"}.`}>
      {error ? (
        <p role="alert" className="text-[13px] text-failed">
          {error}
        </p>
      ) : null}
      {finished.length > 0 ? (
        <ul aria-label="Done lists" className="divide-y divide-line rounded-stamp border border-line bg-sheet">
          {finished.map((f) => {
            const { list, sent } = f;
            const rows = `${list.rowCount} ${list.rowCount === 1 ? "row" : "rows"}`;
            const when = list.doneAt ? `marked done ${formatWhen(list.doneAt)}` : `last sent ${formatWhen(f.at)}`;
            const selected = openName !== null && keyOf(list.name) === keyOf(openName);
            return (
              <SavedRow
                key={list.id}
                title={list.name}
                meta={`${list.tabNames ? `${list.tabNames.length} tabs · ` : ""}${rows} · ${when}`}
                tabs={tabChips(list, sent)}
                selected={selected}
                badge={
                  <span className="flex gap-1">
                    {selected ? <Badge tone="postal">Selected</Badge> : null}
                    {list.doneAt ? <Badge tone="sent">Done</Badge> : null}
                    {sent ? <Badge tone="sent">{sent.sent} sent</Badge> : null}
                    {sent && sent.failed > 0 ? <Badge tone="failed">{sent.failed} failed</Badge> : null}
                  </span>
                }
                actionLabel={selected ? "View" : "Open"}
                quietAction={selected}
                onAction={() => (selected ? onView() : onOpen(f))}
                extra={{ label: "Move back", hint: "Move back to Saved lists", icon: <Undo2 className="size-4" aria-hidden />, onClick: () => onRestore(f) }}
                deleteLabel={`Delete list ${list.name}`}
                confirmNote={sent ? `Deletes the list and its send history (${plural(sent.runs, "send")}).` : "Deletes this list."}
                onDelete={() => onDelete(f)}
                busy={busy}
              />
            );
          })}
        </ul>
      ) : null}
      {loading || loose.length > 0 ? (
        <ul aria-label="Sent files" className="divide-y divide-line rounded-stamp border border-line bg-sheet">
          {loading ? <li className="px-3 py-3"><LoadingRows label="Loading sent files" /></li> : null}
          {loose.map((f) => (
            <SavedRow
              key={f.fileName.toLowerCase()}
              title={f.fileName}
              meta={`${plural(f.runs, "send")} · last ${formatWhen(f.lastSentAt)}`}
              badge={
                <span className="flex gap-1">
                  <Badge tone="sent">{f.sent} sent</Badge>
                  {f.failed > 0 ? <Badge tone="failed">{f.failed} failed</Badge> : null}
                </span>
              }
              actionLabel="History"
              quietAction
              onAction={() => setStep("history")}
              deleteLabel={`Delete ${f.fileName} from sent files`}
              confirmNote="Clears this file's send history."
              onDelete={() => onDeleteFile(f)}
              busy={busy}
            />
          ))}
        </ul>
      ) : null}
    </SavedShell>
  );
}
