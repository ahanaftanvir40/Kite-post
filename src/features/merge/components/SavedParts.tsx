"use client";

import { Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";

interface RowProps {
  title: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
  deleteLabel: string;
  onDelete: () => void;
  busy?: boolean;
  /** Marks the row currently in use. */
  badge?: ReactNode;
  /** A quiet action, e.g. for the row that is already in use. */
  quietAction?: boolean;
  /** Shown in place of the details while asking to confirm a delete, e.g. what else goes with it. */
  confirmNote?: string;
  /** One more action between the main one and delete, e.g. "Mark done". */
  extra?: { label: string; icon: ReactNode; onClick: () => void; hint?: string };
}

/** One saved item: what it is, one primary action, and a delete. */
export function SavedRow({ title, meta, actionLabel, onAction, deleteLabel, onDelete, busy, badge, quietAction, extra, confirmNote }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate" title={title}>
            {title}
          </span>
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-3" title={confirming && confirmNote ? confirmNote : meta}>
          {confirming && confirmNote ? confirmNote : meta}
        </p>
      </div>
      {confirming ? (
        <>
          <Button
            variant="danger"
            className="h-8"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
            disabled={busy}
          >
            Delete
          </Button>
          <Button variant="ghost" className="h-8" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </>
      ) : (
        <>
          <Button className="h-8" variant={quietAction ? "ghost" : "secondary"} onClick={onAction} disabled={busy}>
            {actionLabel}
          </Button>
          {extra ? (
            <button
              type="button"
              aria-label={extra.label}
              title={extra.hint ?? extra.label}
              onClick={extra.onClick}
              disabled={busy}
              className="grid size-8 cursor-pointer place-items-center rounded-stamp text-ink-3 transition-colors hover:bg-sent-wash hover:text-sent disabled:cursor-not-allowed"
            >
              {extra.icon}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={deleteLabel}
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="grid size-8 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-failed-wash hover:text-failed disabled:cursor-not-allowed"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </>
      )}
    </li>
  );
}

interface SaveFormProps {
  label: string;
  placeholder: string;
  buttonLabel: string;
  initialName?: string;
  disabled?: boolean;
  /** Disable the button for this name, e.g. when saving it would change nothing. */
  disabledFor?: (name: string) => boolean;
  /** Shown after a successful save. */
  savedText?: string;
  /** Resolve with "skipped" when the caller reports the outcome itself (or is waiting on a dialog). */
  onSave: (name: string) => Promise<void | "skipped">;
}

/** A name field and a save button. Shows its own error and a short "saved" note. */
export function SaveForm({ label, placeholder, buttonLabel, initialName = "", disabled, disabledFor, savedText = "Saved.", onSave }: SaveFormProps) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setNote(null);
    try {
      const outcome = await onSave(trimmed);
      if (outcome !== "skipped") setNote({ tone: "ok", text: savedText });
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <label className="block text-sm font-medium">
        {label}
        <span className="mt-1 flex gap-2">
          <input
            className={`${inputClass} h-9`}
            value={name}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => {
              setName(e.target.value);
              setNote(null);
            }}
          />
          <Button type="submit" loading={pending} disabled={disabled || !name.trim() || Boolean(disabledFor?.(name.trim()))}>
            {buttonLabel}
          </Button>
        </span>
      </label>
      {note ? (
        <p role={note.tone === "error" ? "alert" : "status"} className={`text-[13px] ${note.tone === "error" ? "text-failed" : "text-sent"}`}>
          {note.text}
        </p>
      ) : null}
    </form>
  );
}

export function SavedEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-3 text-sm text-ink-3">{children}</p>;
}

export function SavedShell({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-ink-3">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
