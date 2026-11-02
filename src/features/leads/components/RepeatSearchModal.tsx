"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { StudySearchRecord } from "@/lib/db/types";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function when(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `on ${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

interface Props {
  previous: StudySearchRecord;
  /** Free searches left, or null when there is no limit (or it could not be read). */
  remaining: number | null;
  onSearch: () => void;
  onClose: () => void;
}

/** Shown before a student search that matches one the person already downloaded. */
export function RepeatSearchModal({ previous, remaining, onSearch, onClose }: Props) {
  return (
    <Modal title="You searched this before" onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink-2">
        You downloaded a list for these same settings {when(previous.lastDownloadedAt)}, with {plural(previous.contacts.length, "contact", "contacts")}.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        We can carry on from where it stopped: we won&apos;t read the pages we already read, and the people you already have won&apos;t be listed again, so you only get new contacts and nobody gets emailed twice.
      </p>
      {remaining !== null ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          This uses one of your free searches. You have {plural(remaining, "search", "searches")} left.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button onClick={onClose}>Not now</Button>
        <Button variant="primary" onClick={onSearch} data-autofocus>
          Find new contacts
        </Button>
      </div>
    </Modal>
  );
}
