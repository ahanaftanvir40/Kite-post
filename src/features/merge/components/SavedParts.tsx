"use client";

import { Check, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";

interface RowProps {
  title: string;
  meta: string;
  /** The main action. Leave both out when the row has nothing to offer, e.g. it is already in use. */
  actionLabel?: string;
  onAction?: () => void;
  deleteLabel: string;
  /** Deleting. Return the promise so the row can show it is working until it is done. */
  onDelete: () => void | Promise<void>;
  busy?: boolean;
  /** Marks the row currently in use. */
  badge?: ReactNode;
  /** A quiet action, e.g. for the row that is already in use. */
  quietAction?: boolean;
  /** The row whose content is open right now. It is tinted and announced as current. */
  selected?: boolean;
  /** Shown in place of the details while asking to confirm a delete, e.g. what else goes with it. */
  confirmNote?: string;
  /** One more action between the main one and delete, e.g. "Mark done". */
  extra?: { label: string; icon: ReactNode; onClick: () => void; hint?: string };
  /** The tabs of a workbook, each marked when it has been sent from. */
  tabs?: { name: string; done: boolean }[];
}

/** Which tabs of a workbook are completed, so nobody has to open it to find out. */
function TabChips({ tabs }: { tabs: { name: string; done: boolean }[] }) {
  return (
    <ul aria-label="Tabs" className="mt-1.5 flex flex-wrap gap-1">
      {tabs.map((t) => (
        <li
          key={t.name}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
            t.done ? "border-sent/30 bg-sent-wash text-sent" : "border-line bg-sunk text-ink-3"
          }`}
        >
          {t.done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
          <span className="truncate">{t.name}</span>
          <span className="sr-only">{t.done ? ", completed" : ", not sent yet"}</span>
        </li>
      ))}
    </ul>
  );
}

/** One saved item: what it is, one primary action, and a delete. */
export function SavedRow({ title, meta, actionLabel, onAction, deleteLabel, onDelete, busy, badge, quietAction, selected, extra, confirmNote, tabs }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      // The row is usually gone by now. If the delete failed it stays, back to normal.
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li
      aria-current={selected ? "true" : undefined}
      className={`flex items-center gap-3 px-4 py-3 max-sm:flex-wrap max-sm:gap-y-2 ${selected ? "bg-postal-wash/60" : ""}`}
    >
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        {/* The badge sits with the details, so it never takes room from the name. */}
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-3">
          {badge && !confirming ? <span className="shrink-0">{badge}</span> : null}
          <span className="truncate" title={confirming && confirmNote ? confirmNote : meta}>
            {confirming && confirmNote ? confirmNote : meta}
          </span>
        </p>
        {tabs && !confirming ? <TabChips tabs={tabs} /> : null}
      </div>
      {confirming ? (
        <>
          <Button variant="danger" className="h-8" onClick={() => void confirmDelete()} loading={deleting} disabled={busy && !deleting}>
            {deleting ? "Deleting" : "Delete"}
          </Button>
          <Button variant="ghost" className="h-8" onClick={() => setConfirming(false)} disabled={deleting}>
            Keep
          </Button>
        </>
      ) : (
        <>
          {actionLabel && onAction ? (
            <Button className="h-8" variant={quietAction ? "ghost" : "secondary"} onClick={onAction} disabled={busy}>
              {actionLabel}
            </Button>
          ) : null}
          {extra ? (
            <button
              type="button"
              aria-label={extra.label}
              title={extra.hint ?? extra.label}
              onClick={extra.onClick}
              disabled={busy}
              className="grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp text-ink-3 transition-colors hover:bg-sent-wash hover:text-sent disabled:cursor-not-allowed"
            >
              {extra.icon}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={deleteLabel}
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="grid size-8 max-sm:size-11 cursor-pointer place-items-center rounded-stamp text-ink-3 hover:bg-failed-wash hover:text-failed disabled:cursor-not-allowed"
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
  /** Make the button the main thing to do right now, e.g. there are unsaved changes. */
  emphasis?: boolean;
  /** Shown after a successful save. */
  savedText?: string;
  /** Resolve with "skipped" when the caller reports the outcome itself (or is waiting on a dialog). */
  onSave: (name: string) => Promise<void | "skipped">;
}

/** A name field and a save button. Shows its own error and a short "saved" note. */
export function SaveForm({ label, placeholder, buttonLabel, initialName = "", disabled, disabledFor, emphasis, savedText = "Saved.", onSave }: SaveFormProps) {
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
          <Button type="submit" variant={emphasis ? "primary" : "secondary"} loading={pending} disabled={disabled || !name.trim() || Boolean(disabledFor?.(name.trim()))}>
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
