"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParsedWorkbook } from "@/lib/spreadsheet";
import { ApiError, type RecipientListRecord, type RecipientListSummary, type RunSummary } from "./api";

export interface SavedItems<T> {
  items: T[];
  /** True until the first response (or failure) arrives. */
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Fetch a saved collection when `enabled`, and let callers refresh it after a
 * change. `scope` names what the collection belongs to (a workspace id): when
 * it changes the list is fetched again, and the previous scope's items are
 * never shown under the new one.
 */
export function useSavedItems<T>(fetcher: () => Promise<T[]>, enabled: boolean, scope = ""): SavedItems<T> {
  const [state, setState] = useState<{ scope: string; items: T[]; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetcher()
      .then((items) => live && setState({ scope, items, error: null }))
      .catch((e: unknown) => live && setState({ scope, items: [], error: messageOf(e, "Could not load saved items.") }));
    return () => {
      live = false;
    };
    // `fetcher` closes over `scope`, so it is covered by that dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, scope]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state && state.scope === scope ? state : null;
  return { items: current?.items ?? [], loading: enabled && !current, error: current?.error ?? null, reload };
}

/** Turn a saved list back into the shape the Recipients step works with. */
export function workbookFromList(list: RecipientListRecord): ParsedWorkbook {
  return {
    fileName: list.fileName || list.name,
    sheets: [
      {
        name: list.name,
        headers: list.headers,
        rows: list.rows,
        // The header was row 1 in the original file; data rows follow.
        rowNumbers: list.rows.map((_, i) => i + 2),
        truncated: false,
      },
    ],
  };
}

export interface SentFile {
  fileName: string;
  /** How many separate sends used this file. */
  runs: number;
  sent: number;
  failed: number;
  /** When the most recent send finished. */
  lastSentAt: string;
}

/**
 * One entry per spreadsheet that has been sent from, newest first. Runs recorded
 * before files were tracked have no name and are left out. File names compare
 * without regard to case or surrounding space, so "Leads.xlsx" and "leads.xlsx " are one file.
 */
export function groupRunsByFile(runs: RunSummary[]): SentFile[] {
  const byFile = new Map<string, SentFile>();
  for (const run of runs) {
    const name = run.fileName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const seen = byFile.get(key);
    if (!seen) {
      byFile.set(key, { fileName: name, runs: 1, sent: run.sent, failed: run.failed, lastSentAt: run.finishedAt });
      continue;
    }
    seen.runs += 1;
    seen.sent += run.sent;
    seen.failed += run.failed;
    // The newest send decides both the date and which spelling of the name is shown.
    if (run.finishedAt > seen.lastSentAt) {
      seen.lastSentAt = run.finishedAt;
      seen.fileName = name;
    }
  }
  return [...byFile.values()].sort((a, b) => b.lastSentAt.localeCompare(a.lastSentAt));
}

/** File names compare without regard to case or surrounding space. */
export const fileKeyOf = (name: string) => name.trim().toLowerCase();

export interface FinishedList {
  list: RecipientListSummary;
  /** Sends made from this list's file, if any. */
  sent: SentFile | null;
  /** When it was finished: marked by hand, or last sent. */
  at: string;
}

export interface ListGroups {
  /** Still to do: these belong in Saved lists. */
  todo: RecipientListSummary[];
  /** Marked done by hand, or sent from after it was last changed. */
  finished: FinishedList[];
  /** Sent files that no saved list belongs to. */
  loose: SentFile[];
}

/**
 * Sort saved lists into to-do and finished. A list is finished once it is marked done,
 * or once its file has been sent from after the list was last saved. Moving a list back
 * counts as a change, so it stays in to-do until it is sent again.
 */
export function groupLists(lists: RecipientListSummary[], files: SentFile[]): ListGroups {
  const byFile = new Map(files.map((f) => [fileKeyOf(f.fileName), f]));
  const owned = new Set<string>();
  const todo: RecipientListSummary[] = [];
  const finished: FinishedList[] = [];
  for (const list of lists) {
    const key = fileKeyOf(list.fileName ?? "");
    const sent = key ? (byFile.get(key) ?? null) : null;
    if (sent) owned.add(key);
    const sentSince = sent !== null && sent.lastSentAt > list.updatedAt;
    if (list.doneAt || sentSince) {
      finished.push({ list, sent, at: list.doneAt ?? sent?.lastSentAt ?? list.updatedAt });
    } else {
      todo.push(list);
    }
  }
  finished.sort((a, b) => b.at.localeCompare(a.at));
  return { todo, finished, loose: files.filter((f) => !owned.has(fileKeyOf(f.fileName))) };
}

export function formatWhen(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: then.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
