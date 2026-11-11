"use client";

import { useMemo, useState } from "react";
import { deleteSaved, listTemplates, saveTemplate, type TemplateRecord } from "../api";
import { useActiveWorkspace } from "../hooks";
import { formatWhen, messageOf, useSavedItems } from "../saved";
import { templateSignature, useMergeStore } from "../store";
import { SavedEmpty, SavedRow, SavedShell, SaveForm } from "./SavedParts";
import { NeedsWorkspace } from "./WorkspaceNotice";
import { Badge } from "@/components/ui/Badge";
import { LoadingRows } from "@/components/ui/Skeleton";
import { keyOf } from "@/lib/db/types";

/** Save the current subject and body for reuse, bring a saved one back, and update the one in use. */
export function SavedTemplates() {
  const workspace = useActiveWorkspace();
  const { id: workspaceId, ready: available } = workspace;
  const subject = useMergeStore((s) => s.subject);
  const body = useMergeStore((s) => s.body);
  const fallbacks = useMergeStore((s) => s.fallbacks);
  const applyTemplate = useMergeStore((s) => s.applyTemplate);
  const inUseName = useMergeStore((s) => s.savedTemplateName);
  const savedSignature = useMergeStore((s) => s.savedTemplateSignature);
  const setSavedTemplateName = useMergeStore((s) => s.setSavedTemplateName);
  const { items, loading, error, reload } = useSavedItems<TemplateRecord>(
    () => listTemplates(workspaceId ?? ""),
    available,
    workspaceId ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; text: string } | null>(null);

  const signature = useMemo(() => templateSignature({ subject, body, fallbacks }), [subject, body, fallbacks]);
  const edited = inUseName !== null && signature !== savedSignature;
  const isInUse = (name: string) => inUseName !== null && keyOf(name) === keyOf(inUseName);

  if (workspace.needsOne) return <NeedsWorkspace what="templates" />;
  if (!available || !workspaceId) return null;

  async function remove(template: TemplateRecord) {
    if (!workspaceId) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteSaved("templates", template.id, workspaceId);
      // Wait for the new list, so the row is gone by the time the spinner stops.
      await reload();
      // Deleting the one in use leaves the message as it is, but it no longer belongs to a template.
      if (isInUse(template.name)) setSavedTemplateName(null);
    } catch (e) {
      setActionError(messageOf(e, "Could not delete that template."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SavedShell title="Saved templates" hint={`Messages saved in ${workspace.name ?? "this workspace"}, with their fallbacks.`}>
      <SaveForm
        // A new in-use name starts the form over, with that name filled in.
        key={`${workspaceId}:${inUseName ?? ""}`}
        label={inUseName ? `Saved as “${inUseName}”` : "Save this message as"}
        placeholder="Welcome email"
        buttonLabel={inUseName ? "Update template" : "Save"}
        initialName={inUseName ?? ""}
        emphasis={edited}
        disabled={!subject.trim() && !body.trim()}
        // Nothing to update until the message or its name changes. A new name saves a copy.
        disabledFor={(name) => inUseName !== null && keyOf(name) === keyOf(inUseName) && !edited}
        onSave={async (name) => {
          const replaces = items.some((t) => keyOf(t.name) === keyOf(name));
          await saveTemplate(workspaceId, { name, subject, body, fallbacks });
          setSavedTemplateName(name);
          setDone({ name, text: replaces ? "Template updated." : "Saved." });
          await reload();
          return "skipped";
        }}
      />
      {done && inUseName !== null && keyOf(done.name) === keyOf(inUseName) && !edited ? (
        <p role="status" className="text-[13px] text-sent">
          {done.text}
        </p>
      ) : null}
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
        {items.map((t) => {
          const current = isInUse(t.name);
          return (
            <SavedRow
              key={t.id}
              title={t.name}
              meta={`${t.subject || "No subject"} · ${formatWhen(t.updatedAt)}`}
              selected={current}
              badge={current ? <Badge tone={edited ? "warn" : "postal"}>{edited ? "In use · edited" : "In use"}</Badge> : null}
              // The one in use has nothing to offer until it is edited. Then the only move is to undo the edits.
              actionLabel={current ? (edited ? "Revert" : undefined) : "Use"}
              quietAction={current}
              onAction={() => applyTemplate(t)}
              deleteLabel={`Delete template ${t.name}`}
              onDelete={() => remove(t)}
              busy={busy}
            />
          );
        })}
      </ul>
    </SavedShell>
  );
}
