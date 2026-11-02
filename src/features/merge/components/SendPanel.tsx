"use client";

import { Check, CircleAlert, Download, Pause, Play, RotateCcw, Send, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EASE_OUT, gsap, progressFraction, useMotion } from "@/lib/motion";
import { sendChunk } from "../api";
import { analyze, fieldsFor, mergeRows, preflight, resultsToCsv, runCounts, type CheckLevel } from "../compose";
import { useTestSend } from "../hooks";
import { runQueue, type StopSignal } from "../queue";
import { activeSheet, pendingIds, sendableRecipients, useMergeStore } from "../store";
import { PreviewPane } from "./PreviewPane";

const LEVEL_ICON = {
  ok: <Check className="mt-0.5 size-4 shrink-0 text-sent" aria-hidden />,
  warn: <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />,
  block: <CircleAlert className="mt-0.5 size-4 shrink-0 text-failed" aria-hidden />,
} satisfies Record<CheckLevel, React.ReactNode>;

function downloadCsv(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "kitepost-results.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function SendPanel() {
  const store = useMergeStore();
  const { session, subject, body, fallbacks, run, testSent } = store;
  const sheet = activeSheet(store);
  const profile = session?.profile;
  const stop = useRef<StopSignal>(null);
  const test = useTestSend();

  const ready = useMemo(() => sendableRecipients(store), [store]);
  const fields = useMemo(() => fieldsFor(sheet?.headers ?? []), [sheet]);
  const analysis = useMemo(() => analyze(subject, body, fields), [subject, body, fields]);
  const merged = useMemo(() => mergeRows(ready, subject, body, fallbacks), [ready, subject, body, fallbacks]);
  const emptyRows = merged.filter((m) => m.empty.length > 0).length;

  const { checks, canSend } = preflight({
    connected: Boolean(session?.connected),
    user: profile?.user,
    fromAddress: profile?.fromAddress,
    fromName: profile?.fromName,
    replyTo: profile?.replyTo,
    quotaLabel: session?.quota?.label,
    sendableCount: ready.length,
    maxRecipients: session?.maxRecipientsPerRun ?? 100,
    subject,
    body,
    analysis,
    emptyRows,
    testSent,
  });

  const counts = runCounts(run);
  const running = run.status === "running";
  const active = running || run.status === "paused";
  const done = counts.sent + counts.failed;

  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useMotion(
    ({ reduce }) => {
      if (reduce) return;
      gsap.from(".check-row", { autoAlpha: 0, x: -8, duration: 0.4, ease: EASE_OUT, stagger: 0.05, clearProps: "all" });
    },
    { scope: root },
  );

  // The bar fill is a transform, so progress never triggers layout.
  useMotion(
    ({ reduce }) => {
      if (!bar.current) return;
      gsap.to(bar.current, { scaleX: progressFraction(done, counts.total), duration: reduce ? 0 : 0.5, ease: EASE_OUT, transformOrigin: "left center" });
    },
    { scope: root, dependencies: [done, counts.total] },
  );

  // Warn before leaving mid-run: the queue lives in this tab only.
  useEffect(() => {
    if (!running) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [running]);

  const execute = useCallback(
    async (ids: string[]) => {
      const state = useMergeStore.getState();
      const byId = new Map(state.recipients.map((r) => [r.id, r]));
      const { runId } = state.run;
      const workspaceId = state.activeWorkspaceId;
      const fileName = state.workbook?.fileName;
      const history =
        runId && workspaceId && state.session?.savingAvailable
          ? { runId, subject: state.subject, workspaceId, ...(fileName ? { fileName } : {}) }
          : undefined;
      const rows = mergeRows(
        ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r)),
        state.subject,
        state.body,
        state.fallbacks,
      );
      stop.current = null;
      const end = await runQueue(
        rows.map((m) => m.message),
        {
          post: (messages) => sendChunk(messages, history),
          stopSignal: () => stop.current,
          onOutcomes: state.applyOutcomes,
        },
      );
      const set = useMergeStore.getState().setRunStatus;
      if (end.reason === "done") set("done");
      else if (end.reason === "paused") set("paused");
      else if (end.reason === "cancelled") set("stopped");
      else set("stopped", end.message);
    },
    [],
  );

  const start = () => {
    const ids = ready.map((r) => r.id);
    store.startRun(ids);
    void execute(ids);
  };
  const resume = () => {
    store.setRunStatus("running");
    void execute(pendingIds(useMergeStore.getState().run));
  };
  const retryFailed = () => {
    store.requeueFailed();
    void execute(pendingIds(useMergeStore.getState().run));
  };

  const failedRows = run.queue.filter((id) => run.results[id]?.status === "failed");
  const idle = run.status === "idle";

  return (
    <div ref={root} className="grid gap-8 max-sm:grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="check-title">
          <h2 id="check-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
            Review and send
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.id} className="check-row flex gap-2">
                {LEVEL_ICON[c.level]}
                <span className={c.level === "block" ? "text-failed" : "text-ink-2"}>{c.text}</span>
              </li>
            ))}
          </ul>
          {test.error ? (
            <p role="alert" className="mt-2 text-sm text-failed">
              {test.error}
            </p>
          ) : null}
        </section>

        {idle ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              onClick={() => void test.send()}
              loading={test.pending}
              disabled={!session?.connected}
              icon={<Send className="size-4" aria-hidden />}
            >
              Send a test to me
            </Button>
            <Button variant="primary" disabled={!canSend} onClick={start}>
              Send to {ready.length} {ready.length === 1 ? "person" : "people"}
            </Button>
          </div>
        ) : (
          <section aria-labelledby="run-title" className="space-y-3 border-t border-line pt-4">
            <h3 id="run-title" className="font-display text-lg font-semibold tracking-[-0.02em]">
              {run.status === "running" ? "Sending" : run.status === "paused" ? "Paused" : run.status === "done" ? "Finished" : "Stopped"}
            </h3>
            <div
              role="progressbar"
              aria-label="Send progress"
              aria-valuemin={0}
              aria-valuemax={counts.total}
              aria-valuenow={done}
              className="h-2 overflow-hidden rounded-full bg-sunk"
            >
              <div ref={bar} className="h-full origin-left rounded-full bg-postal" style={{ transform: "scaleX(0)" }} />
            </div>
            <p aria-live="polite" className="text-sm text-ink-2 tnum">
              {counts.sent} sent, {counts.failed} failed, {counts.pending} waiting
            </p>

            {run.fatal ? (
              <p role="alert" className="flex gap-2 rounded-stamp bg-failed-wash px-3 py-2.5 text-sm text-failed">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {run.fatal}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {running ? (
                <Button onClick={() => (stop.current = "pause")} icon={<Pause className="size-4" aria-hidden />}>
                  Pause after this batch
                </Button>
              ) : null}
              {run.status === "paused" || (run.status === "stopped" && counts.pending > 0 && !run.fatal) ? (
                <Button variant="primary" onClick={resume} icon={<Play className="size-4" aria-hidden />}>
                  Resume
                </Button>
              ) : null}
              {run.status === "stopped" && run.fatal && counts.pending > 0 ? (
                <Button variant="primary" onClick={resume} icon={<Play className="size-4" aria-hidden />}>
                  Try the rest again
                </Button>
              ) : null}
              {active ? (
                <Button variant="danger" onClick={() => (running ? (stop.current = "cancel") : store.setRunStatus("stopped"))} icon={<X className="size-4" aria-hidden />}>
                  Stop
                </Button>
              ) : null}
              {!running && failedRows.length > 0 ? (
                <Button onClick={retryFailed} icon={<RotateCcw className="size-4" aria-hidden />}>
                  Retry {failedRows.length} failed
                </Button>
              ) : null}
              {!running ? (
                <Button variant="ghost" onClick={() => downloadCsv(resultsToCsv(store.recipients, run))} icon={<Download className="size-4" aria-hidden />}>
                  Results CSV
                </Button>
              ) : null}
              {!active ? (
                <Button variant="ghost" onClick={store.resetRun}>
                  Start over
                </Button>
              ) : null}
            </div>

            <ul className="max-h-64 divide-y divide-line overflow-auto rounded-stamp border border-line bg-sheet text-sm">
              {run.queue.map((id) => {
                const r = store.recipients.find((x) => x.id === id);
                const result = run.results[id];
                return (
                  <li key={id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 truncate">{r?.email}</span>
                    {result?.status === "sent" ? <Badge tone="sent">Sent</Badge> : null}
                    {result?.status === "failed" ? (
                      <span title={result.error}>
                        <Badge tone="failed">Failed</Badge>
                      </span>
                    ) : null}
                    {!result ? <Badge>Waiting</Badge> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      <PreviewPane
        rows={merged}
        from={profile ? (profile.fromName ? `${profile.fromName} <${profile.fromAddress}>` : profile.fromAddress) : "Not connected"}
        replyTo={profile?.replyTo ?? "Not connected"}
      />
    </div>
  );
}
