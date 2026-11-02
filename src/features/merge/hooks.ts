"use client";

import { useCallback, useEffect, useState } from "react";
import { renderMessage } from "@/lib/merge";
import { ApiError, getSession, listWorkspaces, sendTest } from "./api";
import { bodyIsEmpty } from "./compose";
import { sendableRecipients, useMergeStore } from "./store";

/** Load the connection status once, and keep it in the store. */
export function useSessionBootstrap(): void {
  const setSession = useMergeStore((s) => s.setSession);
  useEffect(() => {
    let live = true;
    getSession()
      .then((status) => live && setSession(status))
      .catch(() => live && setSession({ connected: false, accessCodeRequired: false, localAccountAvailable: false, maxRecipientsPerRun: 100 }));
    return () => {
      live = false;
    };
  }, [setSession]);
}

/** Load the signed-in account's workspaces, and pick the one it used last. */
export function useWorkspaceBootstrap(): void {
  const user = useMergeStore((s) => (s.session?.savingAvailable ? s.session.account : undefined));
  const setWorkspaces = useMergeStore((s) => s.setWorkspaces);
  useEffect(() => {
    if (!user) return;
    let live = true;
    listWorkspaces()
      .then((items) => live && setWorkspaces(items))
      // Saving stays off for this visit. Nothing else depends on workspaces loading.
      .catch(() => live && setWorkspaces([]));
    return () => {
      live = false;
    };
  }, [user, setWorkspaces]);
}

export interface ActiveWorkspace {
  id: string | null;
  name: string | null;
  /** True when saved lists, templates and history can be used right now. */
  ready: boolean;
  /** True when the server can save but no workspace is chosen yet. */
  needsOne: boolean;
}

/** The workspace saved items are read from and written to. */
export function useActiveWorkspace(): ActiveWorkspace {
  const canSave = useMergeStore((s) => Boolean(s.session?.account && s.session.savingAvailable));
  const id = useMergeStore((s) => s.activeWorkspaceId);
  const name = useMergeStore((s) => s.workspaces?.find((w) => w.id === s.activeWorkspaceId)?.name ?? null);
  const loaded = useMergeStore((s) => s.workspaces !== null);
  return { id, name, ready: canSave && id !== null, needsOne: canSave && loaded && id === null };
}

export const FALLBACK_TEST_SUBJECT = "Kitepost test message";
export const FALLBACK_TEST_BODY = "<p>If this arrived from the address you chose, your sender alias works.</p>";

/** Send one message to the connected mailbox. Uses the first ready row when there is a template. */
export function useTestSend() {
  const markTestSent = useMergeStore((s) => s.markTestSent);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (): Promise<boolean> => {
    const state = useMergeStore.getState();
    const first = sendableRecipients(state)[0];
    let subject = FALLBACK_TEST_SUBJECT;
    let html = FALLBACK_TEST_BODY;
    if (state.subject.trim() && !bodyIsEmpty(state.body)) {
      const values = first?.values ?? {};
      const rendered = renderMessage(state.subject, state.body, values, state.fallbacks);
      subject = rendered.subject || subject;
      html = rendered.html;
    }
    setPending(true);
    setError(null);
    try {
      await sendTest(subject, html);
      markTestSent();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The test email could not be sent.");
      return false;
    } finally {
      setPending(false);
    }
  }, [markTestSent]);

  return { send, pending, error };
}
