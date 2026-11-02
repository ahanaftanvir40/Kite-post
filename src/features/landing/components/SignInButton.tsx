"use client";

import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { NAV_PILL } from "./navStyles";
import { SignInModal } from "./SignInModal";

const subscribeNever = () => () => {};

/** The signed-out call to action. Opens on its own when the proxy bounced someone here (`?signin=1`). */
export function SignInButton() {
  // The modal portals into document.body, so it may only render in the browser.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  const bounced = useSearchParams().get("signin") === "1";
  const [dismissed, setDismissed] = useState(false);
  const [opened, setOpened] = useState(false);
  const open = inBrowser && (opened || (bounced && !dismissed));

  function close() {
    setOpened(false);
    setDismissed(true);
  }

  return (
    <>
      <button type="button" onClick={() => setOpened(true)} className={NAV_PILL}>
        Sign in
      </button>
      {open ? <SignInModal onClose={close} /> : null}
    </>
  );
}
