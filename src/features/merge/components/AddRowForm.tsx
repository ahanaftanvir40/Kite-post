"use client";

import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/TextField";
import { activeSheet, useMergeStore } from "../store";

/** Add one recipient by hand, with a field for every column of the loaded sheet. */
export function AddRowForm() {
  const store = useMergeStore();
  const sheet = activeSheet(store);
  const { emailColumn } = store;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string | null>(null);

  if (!sheet || !emailColumn) return null;

  function close() {
    setOpen(false);
    setValues({});
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!emailColumn || !(values[emailColumn] ?? "").trim()) return;
    const id = store.addRow(values);
    if (!id) return;
    const flagged = useMergeStore.getState().excluded.has(id);
    setAdded(flagged ? "Added, but it is flagged and unchecked. See its status in the table." : "Row added.");
    // Keep the form open for the next person, with the fields cleared.
    setValues({});
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setAdded(null);
            setOpen(true);
          }}
          icon={<Plus className="size-4" aria-hidden />}
        >
          Add row
        </Button>
        {added ? (
          <p role="status" className="text-[13px] text-sent">
            {added}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-label="Add a row" className="space-y-3 rounded-stamp border border-line bg-sheet p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sheet.headers.map((h) => (
          <label key={h} className="text-sm">
            <span className="mb-1 block font-medium">
              {h}
              {h === emailColumn ? <span className="text-ink-3"> (required)</span> : null}
            </span>
            <input
              className={`${inputClass} h-9`}
              value={values[h] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [h]: e.target.value }));
                setAdded(null);
              }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={!(values[emailColumn] ?? "").trim()}>
          Add to list
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Done
        </Button>
        {added ? (
          <p role="status" className="text-[13px] text-sent">
            {added}
          </p>
        ) : null}
      </div>
    </form>
  );
}
