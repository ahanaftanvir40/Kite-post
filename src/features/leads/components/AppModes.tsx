"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Workspace } from "@/features/merge/components/Workspace";
import { LeadsHub } from "./LeadsHub";

type Mode = "merge" | "leads";

const MODES: { id: Mode; label: string }[] = [
  { id: "merge", label: "Email merger" },
  { id: "leads", label: "Lead finder" },
];

/**
 * Switches between the merger and the lead finder. Both stay mounted so neither loses its place
 * (a half-written email, a running lead search) when the user flips to the other.
 */
export function AppModes() {
  const [mode, setMode] = useState<Mode>("merge");
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-line bg-sheet">
        <div role="tablist" aria-label="Tool" className="mx-auto flex max-w-6xl gap-1 px-4 pt-3 sm:px-6">
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                id={`mode-${m.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`mode-panel-${m.id}`}
                onClick={() => setMode(m.id)}
                className={`-mb-px inline-flex h-10 max-sm:h-11 cursor-pointer items-center gap-2 border-b-2 px-4 text-sm transition-colors duration-200 ${
                  active ? "border-kite-coral font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {m.label}
                {m.id === "leads" ? <Badge tone="warn">Beta</Badge> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div id="mode-panel-merge" role="tabpanel" aria-labelledby="mode-merge" hidden={mode !== "merge"} className="flex-1 flex-col data-[on=true]:flex" data-on={mode === "merge"}>
        <Workspace />
      </div>
      <div id="mode-panel-leads" role="tabpanel" aria-labelledby="mode-leads" hidden={mode !== "leads"} className="flex-1 flex-col data-[on=true]:flex" data-on={mode === "leads"}>
        <LeadsHub />
      </div>
    </div>
  );
}
