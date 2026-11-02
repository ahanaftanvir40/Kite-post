"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/** Shown when an account has used its free lead searches. */
export function BetaQuotaModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="You've used your free searches" onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink-2">
        The lead finder is still in beta, so each account gets a couple of searches for now. We&apos;re raising the limit soon.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Your spreadsheets and the email merger aren&apos;t affected. Keep using them as usual.
      </p>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={onClose} data-autofocus>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
