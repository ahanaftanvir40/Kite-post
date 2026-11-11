"use client";

import { FolderOpen, Settings2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { useMergeStore } from "../store";

/** Not a workspace: choosing it opens the screen to create, rename and delete them. */
const MANAGE = "__manage__";

/**
 * The one place for workspaces: pick the one everything is saved into, or choose "Manage workspaces"
 * at the end of the list to create, rename or delete them. It lives in the navbar so it is always in reach.
 */
export function WorkspaceSwitcher() {
  const canSave = useMergeStore((s) => Boolean(s.session?.account && s.session.savingAvailable));
  const workspaces = useMergeStore((s) => s.workspaces);
  const activeId = useMergeStore((s) => s.activeWorkspaceId);
  const switchWorkspace = useMergeStore((s) => s.switchWorkspace);
  const setStep = useMergeStore((s) => s.setStep);
  const running = useMergeStore((s) => s.run.status === "running");

  if (!canSave || workspaces === null) return null;

  if (workspaces.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setStep("workspaces")}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-postal underline hover:text-postal-deep"
      >
        <FolderOpen className="size-4" aria-hidden /> Create a workspace
      </button>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <FolderOpen className="size-4 text-ink-3" aria-hidden />
      <span className="sr-only sm:not-sr-only sm:text-ink-3">Workspace</span>
      <Select
        aria-label="Workspace"
        variant="pill"
        className="max-w-48"
        value={activeId ?? ""}
        // Changing folders mid-send would file the rest of the run under another workspace.
        disabled={running}
        onChange={(id) => (id === MANAGE ? setStep("workspaces") : switchWorkspace(id || null))}
        options={[
          ...(activeId === null ? [{ value: "", label: "Choose a workspace" }] : []),
          ...workspaces.map((w) => ({ value: w.id, label: w.name })),
          { value: MANAGE, label: "Manage workspaces", action: true, icon: <Settings2 className="size-4" aria-hidden /> },
        ]}
      />
    </label>
  );
}
