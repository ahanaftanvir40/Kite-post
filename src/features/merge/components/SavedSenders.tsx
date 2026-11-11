"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { deleteSaved, listSenders, switchSender, type SenderRecord } from "../api";
import { formatWhen, messageOf, useSavedItems } from "../saved";
import { useMergeStore } from "../store";
import { SavedEmpty, SavedRow, SavedShell } from "./SavedParts";
import { LoadingRows } from "@/components/ui/Skeleton";

/** From / Reply-To pairs used with this mailbox before. Never includes a password. */
export function SavedSenders() {
  const enabled = useMergeStore((s) => Boolean(s.session?.connected && s.session.savingAvailable));
  const current = useMergeStore((s) => s.session?.profile?.fromAddress);
  const setProfile = useMergeStore((s) => s.setProfile);
  const { items, loading, error, reload } = useSavedItems<SenderRecord>(listSenders, enabled);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!enabled) return null;

  async function choose(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      setProfile(await switchSender(id));
      reload();
    } catch (e) {
      setActionError(messageOf(e, "Could not switch sender."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      await deleteSaved("senders", id);
      // Wait for the new list, so the row is gone by the time the spinner stops.
      await reload();
    } catch (e) {
      setActionError(messageOf(e, "Could not delete that sender."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SavedShell title="Sender addresses" hint="Switch the From and Reply-To without pasting the app password again.">
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
      <ul aria-label="Saved senders" className="divide-y divide-line rounded-stamp border border-line bg-sheet">
        {loading ? <li className="px-3 py-3"><LoadingRows label="Loading senders" /></li> : null}
        {!loading && items.length === 0 && !error ? <SavedEmpty>None yet.</SavedEmpty> : null}
        {items.map((s) => {
          const active = s.fromAddress.toLowerCase() === current?.toLowerCase();
          return (
            <SavedRow
              key={s.id}
              title={s.fromName || s.fromAddress}
              meta={`${s.fromName ? `${s.fromAddress} · ` : ""}Replies to ${s.replyTo} · ${formatWhen(s.lastUsedAt)}`}
              actionLabel={active ? "In use" : "Use"}
              quietAction={active}
              onAction={() => void choose(s.id)}
              deleteLabel={`Delete sender ${s.fromAddress}`}
              onDelete={() => remove(s.id)}
              busy={busy || active}
              badge={active ? <Badge tone="postal">Current</Badge> : null}
            />
          );
        })}
      </ul>
    </SavedShell>
  );
}
