"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { sendableRecipients, STEPS, useMergeStore, type FlowStepId, type StepId } from "../store";

/** What the primary action on each step does, and when it is allowed. */
export function nextStep(step: StepId): FlowStepId | null {
  const i = STEPS.findIndex((s) => s.id === step);
  return i === -1 ? null : (STEPS[i + 1]?.id ?? null);
}

export function StatusBar() {
  const step = useMergeStore((s) => s.step);
  const setStep = useMergeStore((s) => s.setStep);
  const session = useMergeStore((s) => s.session);
  const ready = useMergeStore((s) => sendableRecipients(s).length);
  const subject = useMergeStore((s) => s.subject);

  const profile = session?.profile;
  const next = nextStep(step);

  const gate: Record<FlowStepId, { ok: boolean; hint: string }> = {
    connect: { ok: Boolean(session?.connected), hint: "Connect a mailbox to continue" },
    recipients: { ok: ready > 0, hint: "Add a spreadsheet with at least one valid email" },
    compose: { ok: subject.trim().length > 0, hint: "Write a subject to continue" },
    send: { ok: true, hint: "" },
  };
  const { ok, hint } = step === "history" || step === "workspaces" ? { ok: true, hint: "" } : gate[step];
  const label = next ? STEPS.find((s) => s.id === next)?.label : null;

  return (
    <footer className="sticky bottom-0 z-10 border-t border-line bg-sheet/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1.5 max-sm:min-w-0">
            <dt className="text-ink-3">Mailbox</dt>
            <dd className="font-medium text-ink max-sm:truncate">{session?.connected ? profile?.user : "Not connected"}</dd>
          </div>
          {session?.connected && profile ? (
            <div className="flex min-w-0 gap-1.5">
              <dt className="text-ink-3">Sending as</dt>
              <dd className="truncate font-medium">{profile.fromAddress}</dd>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <dt className="text-ink-3">Ready</dt>
            <dd className="font-medium tnum">{ready}</dd>
          </div>
        </dl>

        {next && label ? (
          <div className="flex items-center gap-3">
            {!ok ? <span className="hidden text-sm text-ink-3 sm:inline">{hint}</span> : null}
            <Button variant="primary" disabled={!ok} onClick={() => setStep(next)} icon={<ArrowRight className="size-4" aria-hidden />}>
              {label}
            </Button>
          </div>
        ) : null}
      </div>
    </footer>
  );
}
