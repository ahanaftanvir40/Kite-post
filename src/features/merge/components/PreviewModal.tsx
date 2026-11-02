"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { mergeRows } from "../compose";
import { sendableRecipients, useMergeStore } from "../store";
import { PreviewPane } from "./PreviewPane";

/** The message as each recipient will get it, built from what is in the editor right now. */
export function PreviewModal({ onClose }: { onClose: () => void }) {
  const store = useMergeStore();
  const { subject, body, fallbacks, session } = store;
  const profile = session?.profile;
  // People who will actually be sent to. Before any are ready, show whoever is in the file.
  const recipients = useMemo(() => {
    const ready = sendableRecipients(store);
    return ready.length > 0 ? ready : store.recipients;
    // `store` changes on every edit, which is exactly when the preview must refresh.
  }, [store]);
  const rows = useMemo(() => mergeRows(recipients, subject, body, fallbacks), [recipients, subject, body, fallbacks]);

  return (
    <Modal title="Preview" wide onClose={onClose}>
      <div className="space-y-4">
        <PreviewPane
          hideTitle
          frameClass="h-96"
          rows={rows}
          from={profile ? (profile.fromName ? `${profile.fromName} <${profile.fromAddress}>` : profile.fromAddress) : "Not connected"}
          replyTo={profile?.replyTo ?? "Not connected"}
        />
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose} data-autofocus>
            Close preview
          </Button>
        </div>
      </div>
    </Modal>
  );
}
