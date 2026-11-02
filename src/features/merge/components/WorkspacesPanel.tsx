"use client";

import { Check, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { createWorkspace, deleteWorkspace, listWorkspaces, renameWorkspace, type WorkspaceSummary } from "../api";
import { messageOf } from "../saved";
import { useMergeStore } from "../store";
import { SaveForm } from "./SavedParts";

const ONLY_ONE_NOTE = "You need at least one workspace, so this one can't be deleted.";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describe(w: WorkspaceSummary): string {
  const { lists, templates, runs } = w.counts;
  if (lists + templates + runs === 0) return "Empty";
  return [plural(lists, "list"), plural(templates, "template"), plural(runs, "send")].join(" · ");
}

interface CardProps {
  workspace: WorkspaceSummary;
  active: boolean;
  busy: boolean;
  /** This is the only workspace, so it cannot be deleted. */
  onlyOne: boolean;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function WorkspaceCard({ workspace, active, busy, onlyOne, onOpen, onRename, onDelete }: CardProps) {
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(work: () => Promise<void>, fail: string) {
    setPending(true);
    setError(null);
    try {
      await work();
      setMode("view");
    } catch (e) {
      setError(messageOf(e, fail));
    } finally {
      setPending(false);
    }
  }

  function submitRename(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (next === workspace.name) return setMode("view");
    void run(() => onRename(next), "Could not rename that workspace.");
  }

  const total = workspace.counts.lists + workspace.counts.templates + workspace.counts.runs;

  return (
    <li className={`rounded-stamp border bg-sheet px-3 py-3 ${active ? "border-postal" : "border-line"}`}>
      {mode === "rename" ? (
        <form onSubmit={submitRename} className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`New name for ${workspace.name}`}
            className={`${inputClass} h-9 min-w-0 flex-1`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setName(workspace.name);
                setMode("view");
              }
            }}
            autoFocus
          />
          <Button type="submit" loading={pending} disabled={!name.trim()}>
            Save name
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setName(workspace.name);
              setError(null);
              setMode("view");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FolderOpen className={`size-5 shrink-0 ${active ? "text-postal" : "text-ink-3"}`} aria-hidden />
          <div className="min-w-0 flex-1 max-sm:min-w-[12rem]">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{workspace.name}</span>
              {active ? <Badge tone="postal">Current</Badge> : null}
            </p>
            <p className="truncate text-xs text-ink-3">{describe(workspace)}</p>
          </div>
          {mode === "delete" ? (
            <div className="flex items-center gap-2">
              <Button variant="danger" className="h-8" loading={pending} onClick={() => void run(onDelete, "Could not delete that workspace.")}>
                Delete workspace
              </Button>
              <Button variant="ghost" className="h-8" onClick={() => setMode("view")}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button className="h-8" variant={active ? "secondary" : "primary"} onClick={onOpen} disabled={busy}>
                {active ? "Go to recipients" : "Open"}
              </Button>
              <button
                type="button"
                aria-label={`Rename workspace ${workspace.name}`}
                onClick={() => {
                  setError(null);
                  setMode("rename");
                }}
                disabled={busy}
                className="grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-sunk hover:text-ink disabled:cursor-not-allowed"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Delete workspace ${workspace.name}`}
                title={onlyOne ? ONLY_ONE_NOTE : undefined}
                onClick={() => {
                  setError(null);
                  setMode("delete");
                }}
                disabled={busy || onlyOne}
                className="grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-failed-wash hover:text-failed disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-3"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}
      {mode === "delete" ? (
        <p role="alert" className="mt-2 text-[13px] text-failed">
          {total === 0
            ? `Delete “${workspace.name}”?`
            : `This permanently deletes “${workspace.name}” and everything in it: ${describe(workspace)}.`}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-failed">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** Workspaces are folders: each one keeps its own saved lists, templates and send history. */
export function WorkspacesPanel() {
  const session = useMergeStore((s) => s.session);
  const workspaces = useMergeStore((s) => s.workspaces);
  const activeId = useMergeStore((s) => s.activeWorkspaceId);
  const setWorkspaces = useMergeStore((s) => s.setWorkspaces);
  const switchWorkspace = useMergeStore((s) => s.switchWorkspace);
  const setStep = useMergeStore((s) => s.setStep);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session?.account) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Workspaces</h2>
        <p className="mt-2 text-sm text-ink-2">{session ? "Sign in to keep your work in workspaces." : "Loading…"}</p>
      </div>
    );
  }
  if (!session.savingAvailable) {
    return (
      <div className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Workspaces</h2>
        <p className="mt-2 text-sm text-ink-2">This server has no database set up, so workspaces cannot be kept.</p>
      </div>
    );
  }

  async function refresh(prefer?: string | null) {
    setWorkspaces(await listWorkspaces(), prefer);
  }

  return (
    <section aria-labelledby="workspaces-title" className="max-w-2xl">
      <h2 id="workspaces-title" className="font-display text-2xl font-semibold tracking-[-0.025em]">
        Workspaces
      </h2>
      <p className="mt-1 max-w-prose text-sm text-ink-2">
        A workspace is a folder for one project or client. Open one, drop your spreadsheet in, and everything you save stays inside it: its own saved lists,
        templates and send history. Your sender addresses are shared across workspaces.
      </p>

      <div className="mt-5 max-w-md">
        <SaveForm
          label="New workspace"
          placeholder="Spring campaign"
          buttonLabel="Create workspace"
          onSave={async (name) => {
            setNotice(null);
            const created = await createWorkspace(name);
            await refresh(created.id);
            setNotice(`“${created.name}” is ready and open. Add a spreadsheet to start.`);
            return "skipped";
          }}
        />
        {notice ? (
          <p role="status" className="mt-1.5 flex items-center gap-1.5 text-[13px] text-sent">
            <Check className="size-3.5" aria-hidden /> {notice}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-failed">
          {error}
        </p>
      ) : null}
      {workspaces === null ? <p className="mt-6 text-sm text-ink-3">Loading…</p> : null}
      {workspaces && workspaces.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">No workspaces yet. Create one above, then add your recipients inside it.</p>
      ) : null}
      {workspaces && workspaces.length > 0 ? (
        <ul aria-label="Workspaces" className="mt-6 space-y-2">
          {workspaces.map((w) => (
            <WorkspaceCard
              key={w.id}
              workspace={w}
              active={w.id === activeId}
              busy={false}
              onlyOne={workspaces.length <= 1}
              onOpen={() => {
                switchWorkspace(w.id);
                setStep("recipients");
              }}
              onRename={async (name) => {
                setNotice(null);
                await renameWorkspace(w.id, name);
                await refresh();
              }}
              onDelete={async () => {
                setNotice(null);
                setError(null);
                try {
                  await deleteWorkspace(w.id);
                } catch (e) {
                  setError(messageOf(e, "Could not delete that workspace."));
                  throw e;
                }
                await refresh();
              }}
            />
          ))}
        </ul>
      ) : null}
      {workspaces && workspaces.length === 1 ? <p className="mt-3 text-[13px] text-ink-3">{ONLY_ONE_NOTE} Create another to be able to remove it.</p> : null}
    </section>
  );
}
