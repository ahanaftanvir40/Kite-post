"use client";

import { useRef } from "react";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { useSessionBootstrap, useWorkspaceBootstrap } from "../hooks";
import { STEPS, useMergeStore, type FlowStepId, type StepId } from "../store";
import { ComposePanel } from "./ComposePanel";
import { ConnectPanel } from "./ConnectPanel";
import { HistoryPanel } from "./HistoryPanel";
import { RecipientsPanel } from "./RecipientsPanel";
import { SendPanel } from "./SendPanel";
import { StatusBar } from "./StatusBar";
import { WorkspacesPanel } from "./WorkspacesPanel";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

/** Views beside the numbered flow. They are never a "next" step. */
const SIDE_VIEWS: { id: Exclude<StepId, FlowStepId>; label: string }[] = [
  { id: "workspaces", label: "Workspaces" },
  { id: "history", label: "History" },
];

function Panel({ step }: { step: StepId }) {
  switch (step) {
    case "connect":
      return <ConnectPanel />;
    case "recipients":
      return <RecipientsPanel />;
    case "compose":
      return <ComposePanel />;
    case "send":
      return <SendPanel />;
    case "history":
      return <HistoryPanel />;
    case "workspaces":
      return <WorkspacesPanel />;
    default: {
      const unreachable: never = step;
      return unreachable;
    }
  }
}

export function Workspace() {
  useSessionBootstrap();
  useWorkspaceBootstrap();
  const step = useMergeStore((s) => s.step);
  const setStep = useMergeStore((s) => s.setStep);
  const stage = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);

  useMotion(
    ({ reduce }) => {
      if (reduce) return;
      gsap.from(".brand-in", { autoAlpha: 0, y: -8, duration: 0.6, ease: EASE_OUT, stagger: 0.08, clearProps: "all" });
    },
    { scope: header },
  );

  useMotion(
    ({ reduce }) => {
      if (reduce) return;
      gsap.from(stage.current, { autoAlpha: 0, y: 12, duration: 0.45, ease: EASE_OUT, clearProps: "all" });
    },
    { scope: stage, dependencies: [step] },
  );

  const current = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="flex flex-1 flex-col">
      <header ref={header} className="border-b border-line bg-sheet">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 pb-5 pt-10 sm:px-6 sm:pt-14">
          <h1 className="sr-only">Kitepost workspace</h1>
          <nav aria-label="Steps" className="brand-in -mx-1 max-w-full overflow-x-auto px-1">
            <ol className="flex w-max items-center gap-1.5">
              {STEPS.map((s, i) => {
                const active = s.id === step;
                const done = i < current;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => setStep(s.id)}
                      className={`group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full pl-2 pr-4 text-sm transition-colors duration-200 ${
                        active ? "bg-kite-ink font-medium text-white" : "text-ink-2 hover:bg-sunk hover:text-ink"
                      }`}
                    >
                      <span
                        className={`grid size-6 place-items-center rounded-full text-xs font-semibold tnum transition-colors duration-200 ${
                          active ? "bg-kite-coral text-white" : done ? "bg-postal-wash text-postal-deep" : "bg-sunk text-ink-3 group-hover:bg-sheet"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
              <li className="ml-2 flex gap-1 border-l border-line pl-3">
                {SIDE_VIEWS.map((v) => {
                  const active = step === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setStep(v.id)}
                      className={`inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm transition-colors duration-200 ${
                        active ? "bg-kite-ink font-medium text-white" : "text-ink-2 hover:bg-sunk hover:text-ink"
                      }`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </li>
            </ol>
          </nav>
          <div className="brand-in">
            <WorkspaceSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div ref={stage}>
          <Panel step={step} />
        </div>
      </main>

      <StatusBar />
    </div>
  );
}
