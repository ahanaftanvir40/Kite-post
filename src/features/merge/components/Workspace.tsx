"use client";

import { FileSpreadsheet, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import { EASE_OUT, gsap, useMotion } from "@/lib/motion";
import { useSessionBootstrap, useWorkspaceBootstrap } from "../hooks";
import { flowStepOf, STEPS, useMergeStore, type FlowStepId, type StepId } from "../store";
import { ComposePanel } from "./ComposePanel";
import { ConnectPanel } from "./ConnectPanel";
import { HistoryPanel } from "./HistoryPanel";
import { RecipientsPanel } from "./RecipientsPanel";
import { SelectedFilePanel } from "./SelectedFilePanel";
import { SendPanel } from "./SendPanel";
import { StatusBar } from "./StatusBar";
import { WorkspacesPanel } from "./WorkspacesPanel";
/**
 * Views beside the numbered flow. They are never a "next" step. Workspaces is not here: it is
 * reached from the picker in the navbar ("Manage workspaces"), so there is one place for it.
 */
interface SideView {
  id: "selected" | "history";
  label: string;
  /** Tooltip, e.g. the name of the open file. */
  hint?: string;
  /** Marks a tab that stands for something you have open, so it is tinted even when you are elsewhere. */
  icon?: LucideIcon;
}

const SIDE_VIEWS: SideView[] = [{ id: "history", label: "History" }];

/** Shorter step names for phones, where the pills share two rows. */
const SHORT_LABELS: Partial<Record<FlowStepId, string>> = { send: "Review" };

function Panel({ step }: { step: StepId }) {
  switch (step) {
    case "connect":
      return <ConnectPanel />;
    case "recipients":
      return <RecipientsPanel />;
    case "selected":
      return <SelectedFilePanel />;
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
  const fileName = useMergeStore((s) => s.workbook?.fileName ?? null);
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

  const at = flowStepOf(step);
  const current = at === null ? -1 : STEPS.findIndex((s) => s.id === at);
  // The loaded file gets a tab of its own, but only while there is a file to show.
  const sideViews: SideView[] = fileName !== null ? [{ id: "selected", label: "Selected file", hint: fileName, icon: FileSpreadsheet }, ...SIDE_VIEWS] : SIDE_VIEWS;

  return (
    <div className="flex flex-1 flex-col">
      <header ref={header} className="border-b border-line bg-sheet">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-start gap-x-8 gap-y-2 px-4 pb-5 pt-10 max-sm:justify-center max-sm:pt-6 sm:px-6 sm:pt-14">
          <h1 className="sr-only">Kitepost workspace</h1>
          <nav aria-label="Steps" className="brand-in -mx-1 max-w-full overflow-x-auto px-1 max-sm:-mx-2 max-sm:w-[calc(100%+1rem)] max-sm:max-w-none max-sm:overflow-visible max-sm:px-0">
            <ol className="flex w-max items-center gap-1.5 max-sm:w-full max-sm:flex-wrap max-sm:justify-center max-sm:gap-x-1 max-sm:gap-y-1.5">
              {STEPS.map((s, i) => {
                const active = s.id === step;
                const done = i < current;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => setStep(s.id)}
                      className={`group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full pl-2 pr-4 text-sm transition-colors duration-200 max-sm:h-11 max-sm:gap-1.5 max-sm:pr-3 max-sm:text-[13px] ${
                        active ? "bg-kite-ink font-medium text-white" : "text-ink-2 hover:bg-sunk hover:text-ink max-sm:px-2.5"
                      }`}
                    >
                      <span
                        className={`grid size-6 place-items-center rounded-full text-xs font-semibold tnum transition-colors duration-200 ${active ? "" : "max-sm:sr-only"} ${
                          active ? "bg-kite-coral text-white" : done ? "bg-postal-wash text-postal-deep" : "bg-sunk text-ink-3 group-hover:bg-sheet"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {SHORT_LABELS[s.id] ? (
                        <>
                          <span className="max-sm:sr-only">{s.label}</span>
                          <span className="sm:hidden" aria-hidden>
                            {SHORT_LABELS[s.id]}
                          </span>
                        </>
                      ) : (
                        s.label
                      )}
                    </button>
                  </li>
                );
              })}
              <li className="ml-2 flex gap-1 border-l border-line pl-3 max-sm:ml-0 max-sm:mt-1 max-sm:basis-full max-sm:justify-center max-sm:gap-1.5 max-sm:border-l-0 max-sm:border-t max-sm:pl-0 max-sm:pt-1.5">
                {sideViews.map((v) => {
                  const active = step === v.id;
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      title={v.hint}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setStep(v.id)}
                      className={`inline-flex h-10 max-sm:h-11 cursor-pointer items-center gap-2 rounded-full text-sm transition-colors duration-200 ${Icon ? "pl-3 pr-4" : "px-4"} ${
                        active
                          ? "bg-kite-ink font-medium text-white"
                          : Icon
                            ? "bg-postal-wash font-medium text-postal-deep hover:bg-sunk"
                            : "text-ink-2 hover:bg-sunk hover:text-ink"
                      }`}
                    >
                      {Icon ? <Icon className={`size-4 ${active ? "text-kite-coral" : "text-postal"}`} aria-hidden /> : null}
                      {v.label}
                    </button>
                  );
                })}
              </li>
            </ol>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 max-sm:py-5 sm:px-6">
        <div ref={stage}>
          <Panel step={step} />
        </div>
      </main>

      <StatusBar />
    </div>
  );
}
