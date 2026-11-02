"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inputClass } from "@/components/ui/TextField";
import { keyOf } from "@/lib/db/types";

interface Props {
  /** The saved list that this save would overwrite. */
  existing: string;
  /** Names already in use, so a new list cannot silently replace another. */
  taken: string[];
  rowCount: number;
  onConfirm: (name: string) => Promise<void>;
  onClose: () => void;
}

/** First "<name> (2)", "(3)"... that nobody uses yet. */
export function suggestName(base: string, taken: string[]): string {
  const used = new Set(taken.map(keyOf));
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(keyOf(candidate))) return candidate;
  }
}

/** Asks whether to overwrite a saved list or keep it and save the current rows as a new one. */
export function SaveListModal({ existing, taken, rowCount, onConfirm, onClose }: Props) {
  const [choice, setChoice] = useState<"update" | "new">("update");
  const [newName, setNewName] = useState(() => suggestName(existing, taken));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = newName.trim();
  const clash = choice === "new" && taken.some((t) => keyOf(t) === keyOf(trimmed));
  const invalid = choice === "new" && (trimmed === "" || clash);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(choice === "update" ? existing : trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setPending(false);
    }
  }

  return (
    <Modal title="Save your changes" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-2">
          You are saving {rowCount} {rowCount === 1 ? "row" : "rows"}. A list called{" "}
          <span className="font-medium text-ink">{existing}</span> already exists.
        </p>

        <fieldset className="space-y-2">
          <legend className="sr-only">How to save</legend>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-stamp border border-line p-3 text-sm has-[:checked]:border-postal has-[:checked]:bg-postal-wash">
            <input
              type="radio"
              name="save-choice"
              className="mt-0.5 accent-postal"
              checked={choice === "update"}
              onChange={() => setChoice("update")}
              data-autofocus
            />
            <span>
              <span className="block font-medium">Update “{existing}”</span>
              <span className="block text-ink-3">Replaces what is saved with the rows you see now.</span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-stamp border border-line p-3 text-sm has-[:checked]:border-postal has-[:checked]:bg-postal-wash">
            <input
              type="radio"
              name="save-choice"
              className="mt-0.5 accent-postal"
              checked={choice === "new"}
              onChange={() => setChoice("new")}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Save as a new list</span>
              <span className="block text-ink-3">Keeps “{existing}” exactly as it is.</span>
            </span>
          </label>
          {choice === "new" ? (
            <div>
              <label htmlFor="new-list-name" className="mb-1 block text-sm font-medium">
                Name of the new list
              </label>
              <input
                id="new-list-name"
                className={`${inputClass} h-9`}
                value={newName}
                maxLength={80}
                aria-invalid={clash || undefined}
                onChange={(e) => setNewName(e.target.value)}
              />
              {clash ? (
                <p role="alert" className="mt-1 text-[13px] text-failed">
                  A list with this name already exists. Pick another name.
                </p>
              ) : null}
            </div>
          ) : null}
        </fieldset>

        {error ? (
          <p role="alert" className="text-[13px] text-failed">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={invalid}>
            {choice === "update" ? "Update list" : "Save new list"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
