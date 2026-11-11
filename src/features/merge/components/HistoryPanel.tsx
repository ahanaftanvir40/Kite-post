"use client";

import { CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { listLists, listRuns, loadRunMessages, type MessageLogRecord, type RecipientListSummary, type RunSummary } from "../api";
import { useActiveWorkspace } from "../hooks";
import { formatWhen, messageOf, useSavedItems } from "../saved";
import { useMergeStore } from "../store";
import { NeedsWorkspace } from "./WorkspaceNotice";
import { LoadingRows } from "@/components/ui/Skeleton";

function RunRow({ run, workspaceId }: { run: RunSummary; workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MessageLogRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || messages) return;
    setLoading(true);
    setError(null);
    try {
      setMessages(await loadRunMessages(workspaceId, run.runId));
    } catch (e) {
      setError(messageOf(e, "Could not load this run."));
    } finally {
      setLoading(false);
    }
  }

  const panelId = `run-${run.runId}`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => void toggle()}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-sunk"
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{run.subject || "No subject"}</span>
          {run.fileName ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
              <FileSpreadsheet className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate" title={run.fileName}>
                {run.fileName}
              </span>
              {run.tab ? <span className="shrink-0 rounded-full bg-sunk px-2 py-0.5 text-ink-2">{run.tab}</span> : null}
            </span>
          ) : null}
          <span className="block truncate text-xs text-ink-3">
            From {run.fromAddress} · {formatWhen(run.finishedAt)}
          </span>
        </span>
        <span className="flex shrink-0 gap-1">
          <Badge tone="sent">{run.sent} sent</Badge>
          {run.failed > 0 ? <Badge tone="failed">{run.failed} failed</Badge> : null}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="border-t border-line bg-sunk/40 px-3 py-2">
          {loading ? <LoadingRows label="Loading run details" rows={2} /> : null}
          {error ? (
            <p role="alert" className="text-sm text-failed">
              {error}
            </p>
          ) : null}
          {messages && messages.length === 0 ? <p className="text-sm text-ink-3">No messages were recorded.</p> : null}
          {messages && messages.length > 0 ? (
            <ul className="max-h-72 divide-y divide-line overflow-auto text-sm">
              {messages.map((m) => (
                <li key={`${m.rowId}-${m.at}`} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{m.to}</span>
                    {m.error ? <span className="block truncate text-xs text-failed">{m.error}</span> : null}
                  </span>
                  <Badge tone={m.status === "sent" ? "sent" : "failed"}>{m.status === "sent" ? "Sent" : "Failed"}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function HistoryPanel() {
  const session = useMergeStore((s) => s.session);
  const workspace = useActiveWorkspace();
  const workspaceId = workspace.id ?? "";
  const enabled = workspace.ready;
  const { items, loading, error, reload: reloadRuns } = useSavedItems<RunSummary>(() => listRuns(workspaceId), enabled, workspaceId);
  const lists = useSavedItems<RecipientListSummary>(() => listLists(workspaceId), enabled, workspaceId);
  // Lists the person marked as done by hand, newest first. They belong in the record beside the sends.
  const markedDone = useMemo(
    () => lists.items.filter((l) => l.doneAt).sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")),
    [lists.items],
  );
  const reload = () => {
    reloadRuns();
    lists.reload();
  };

  if (!session?.account) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Send history</h2>
        <p className="mt-2 text-sm text-ink-2">{session ? "Sign in to see what you have sent." : <LoadingRows label="Loading" rows={1} className="max-w-xs" />}</p>
      </div>
    );
  }

  if (!session.savingAvailable) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Send history</h2>
        <p className="mt-2 text-sm text-ink-2">This server has no database set up, so sends are not recorded.</p>
      </div>
    );
  }

  if (workspace.needsOne) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Send history</h2>
        <NeedsWorkspace what="send history" />
      </div>
    );
  }

  return (
    <section aria-labelledby="history-title" className="max-w-3xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="history-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
            Send history
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Runs sent from {session.account}
            {workspace.name ? ` in ${workspace.name}` : ""}. Kept for 180 days. Only you can see these.
          </p>
        </div>
        <Button variant="ghost" onClick={reload}>
          Refresh
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {loading ? <LoadingRows label="Loading history" rows={3} className="mt-4" /> : null}
      {!loading && !error && items.length === 0 && markedDone.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">Nothing sent yet. Finished runs show up here.</p>
      ) : null}
      {items.length > 0 ? (
        <ul aria-label="Send runs" className="mt-4 divide-y divide-line rounded-stamp border border-line bg-sheet">
          {items.map((run) => (
            <RunRow key={`${workspaceId}:${run.runId}`} run={run} workspaceId={workspaceId} />
          ))}
        </ul>
      ) : null}
      {markedDone.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm font-semibold">Marked as done</h3>
          <p className="mt-0.5 text-xs text-ink-3">Lists you moved to Already done or sent without sending from here.</p>
          <ul aria-label="Lists marked as done" className="mt-2 divide-y divide-line rounded-stamp border border-line bg-sheet">
            {markedDone.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-sent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={l.name}>
                    {l.name}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {l.rowCount} {l.rowCount === 1 ? "row" : "rows"} · marked done {formatWhen(l.doneAt ?? l.updatedAt)}
                  </span>
                </span>
                <Badge tone="sent">Done</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
