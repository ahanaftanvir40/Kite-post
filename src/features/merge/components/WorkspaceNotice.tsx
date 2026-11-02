"use client";

import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useMergeStore } from "../store";

/** Shown where something would be saved, when the mailbox has no workspace yet. */
export function NeedsWorkspace({ what }: { what: string }) {
  const setStep = useMergeStore((s) => s.setStep);
  return (
    <div className="rounded-stamp border border-dashed border-line-strong bg-sheet px-3 py-3 text-sm">
      <p className="text-ink-2">Create a workspace to keep {what}. A workspace is a folder with its own lists, templates and history.</p>
      <Button className="mt-2 h-8" icon={<FolderPlus className="size-4" aria-hidden />} onClick={() => setStep("workspaces")}>
        Create a workspace
      </Button>
    </div>
  );
}
