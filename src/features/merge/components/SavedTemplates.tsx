"use client";

import { useState } from "react";
import { deleteSaved, listTemplates, saveTemplate, type TemplateRecord } from "../api";
import { useActiveWorkspace } from "../hooks";
import { formatWhen, messageOf, useSavedItems } from "../saved";
import { useMergeStore } from "../store";
import { SavedEmpty, SavedRow, SavedShell, SaveForm } from "./SavedParts";
import { NeedsWorkspace } from "./WorkspaceNotice";
import { LoadingRows } from "@/components/ui/Skeleton";

/** Save the current subject and body for reuse, and bring a saved one back. */
export function SavedTemplates() {
  const workspace = useActiveWorkspace();
  const { id: workspaceId, ready: available } = workspace;
  const subject = useMergeStore((s) => s.subject);
  const body = useMergeStore((s) => s.body);
  const fallbacks = useMergeStore((s) => s.fallbacks);
  const applyTemplate = useMergeStore((s) => s.applyTemplate);
  const { items, loading, error, reload } = useSavedItems<TemplateRecord>(
    () => listTemplates(workspaceId ?? ""),
    available,
    workspaceId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (workspace.needsOne) return <NeedsWorkspace what="templates" />;
  if (!available || !workspaceId) return null;

  async function remove(id: string) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteSaved("templates", id, workspaceId);
      reload();
    } catch (e) {
      setActionError(messageOf(e, "Could not delete that template."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SavedShell title="Saved templates" hint={`Messages saved in ${workspace.name ?? "this workspace"}, with their fallbacks.`}>
      <SaveForm
        label="Save this message as"
        placeholder="Welcome email"
        buttonLabel="Save"
        disabled={!subject.trim() && !body.trim()}
        onSave={async (name) => {
          await saveTemplate(workspaceId, { name, subject, body, fallbacks });
          reload();
        }}
      />
      {error ? (
        <p role="alert" className="text-[13px] text-failed">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-[13px] text-failed">
          {actionError}
        </p>
      ) : null}
      <ul aria-label="Saved templates" className="divide-y divide-line rounded-stamp border border-line bg-sheet">
        {loading ? <li className="px-3 py-3"><LoadingRows label="Loading templates" /></li> : null}
        {!loading && items.length === 0 && !error ? <SavedEmpty>No templates in this workspace yet.</SavedEmpty> : null}
        {items.map((t) => (
          <SavedRow
            key={t.id}
            title={t.name}
            meta={`${t.subject || "No subject"} · ${formatWhen(t.updatedAt)}`}
            actionLabel="Use"
            onAction={() => applyTemplate(t)}
            deleteLabel={`Delete template ${t.name}`}
            onDelete={() => void remove(t.id)}
            busy={busy}
          />
        ))}
      </ul>
    </SavedShell>
  );
}
