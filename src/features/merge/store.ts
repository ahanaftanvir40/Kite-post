import { create } from "zustand";
import type { Fallbacks } from "@/lib/merge";
import type { SendOutcome } from "@/lib/mail/send";
import {
  buildRecipients,
  combineSheets,
  defaultExcluded,
  detectEmailColumn,
  parseSpreadsheet,
  SAMPLE_BODY,
  SAMPLE_CSV,
  SAMPLE_SUBJECT,
  type ParsedWorkbook,
  type Recipient,
  type SheetData,
} from "@/lib/spreadsheet";
import type { PublicProfile } from "@/lib/session/seal";
import { newRunId, type SessionStatus, type WorkspaceSummary } from "./api";

export type FlowStepId = "connect" | "recipients" | "compose" | "send";
/** The numbered flow, plus side views (History, Workspaces) that are never a "next" step. */
export type StepId = FlowStepId | "history" | "workspaces";

export const STEPS: { id: FlowStepId; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "recipients", label: "Recipients" },
  { id: "compose", label: "Compose" },
  { id: "send", label: "Review and send" },
];

export type RunStatus = "idle" | "running" | "paused" | "stopped" | "done";

export interface RowResult {
  status: "sent" | "failed";
  error?: string;
}

export interface RunState {
  status: RunStatus;
  /** Groups this run's chunks in send history. Null until a run starts. */
  runId: string | null;
  /** Row ids in this run, in send order. */
  queue: string[];
  results: Record<string, RowResult>;
  fatal: string | null;
}

const IDLE_RUN: RunState = { status: "idle", runId: null, queue: [], results: {}, fatal: null };

const BLOCKING: Recipient["issues"] = ["invalid-email", "empty-email"];
export const isBlocked = (r: Recipient) => r.issues.some((i) => BLOCKING.includes(i));

const REMEMBER_KEY = "postie.workspace";

/** The workspace this mailbox last used, so a reload lands back in it. Never throws. */
export function rememberedWorkspace(owner: string): string | null {
  try {
    return window.localStorage.getItem(`${REMEMBER_KEY}:${owner.toLowerCase()}`);
  } catch {
    return null;
  }
}
function remember(owner: string | undefined, id: string | null): void {
  if (!owner) return;
  try {
    const key = `${REMEMBER_KEY}:${owner.toLowerCase()}`;
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode or storage disabled: the choice just is not remembered.
  }
}

export interface MergeState {
  session: SessionStatus | null;
  sessionLoading: boolean;
  testSent: boolean;

  /** Null until loaded. Only meaningful when the server can save. */
  workspaces: WorkspaceSummary[] | null;
  /** The folder saved lists, templates and history belong to. Null when none is chosen. */
  activeWorkspaceId: string | null;

  /** The list being worked on. Always one sheet: a single tab, or several tabs stacked. */
  workbook: ParsedWorkbook | null;
  /** The file as uploaded when it has several tabs, kept so the choice of tabs can be changed. */
  tabSource: ParsedWorkbook | null;
  /** Which tabs of `tabSource` are in use, so changing tabs starts from the same ticks. */
  tabChoice: number[];
  emailColumn: string | null;
  recipients: Recipient[];
  excluded: Set<string>;
  /** Name of the saved list this sheet came from or was last saved as, if any. */
  savedListName: string | null;
  /** What the saved list holds right now, to tell whether there is anything new to save. */
  savedSignature: string | null;

  subject: string;
  body: string;
  fallbacks: Fallbacks;

  step: StepId;
  previewId: string | null;
  run: RunState;

  setSession: (session: SessionStatus | null) => void;
  setSessionLoading: (loading: boolean) => void;
  markTestSent: () => void;
  /** Switch the From / Reply-To pair. A new alias needs a fresh test email. */
  setProfile: (profile: PublicProfile) => void;
  /** Replace the template with a saved one. */
  applyTemplate: (template: { subject: string; body: string; fallbacks: Fallbacks }) => void;

  setWorkspaces: (workspaces: WorkspaceSummary[], preferId?: string | null) => void;
  /**
   * Move into a workspace. A sheet already loaded stays, but it no longer
   * counts as one of the old workspace's saved lists.
   */
  switchWorkspace: (id: string | null) => void;

  /** Load a file. One with several tabs waits in `tabSource` until `chooseTabs` is called. */
  loadWorkbook: (workbook: ParsedWorkbook) => void;
  loadSample: () => void;
  /** Use these tabs of `tabSource`, stacked in the order of the file. */
  chooseTabs: (indices: number[], options: { addSource: boolean }) => void;
  /** Go back to the tab choice. Edits made to the rows are discarded. */
  changeTabs: () => void;
  setEmailColumn: (column: string) => void;
  clearWorkbook: () => void;
  toggleExcluded: (id: string) => void;
  setAllIncluded: (included: boolean) => void;
  /** Drop rows from the loaded sheet. The original file on disk is untouched. */
  removeRows: (ids: string[]) => void;
  /** Append a row to the loaded sheet. Returns its recipient id, or null if nothing is loaded. */
  addRow: (values: Record<string, string>) => string | null;
  setSavedListName: (name: string | null) => void;

  setSubject: (value: string) => void;
  setBody: (value: string) => void;
  setFallback: (key: string, value: string) => void;

  setStep: (step: StepId) => void;
  setPreviewId: (id: string | null) => void;

  startRun: (ids: string[]) => void;
  setRunStatus: (status: RunStatus, fatal?: string | null) => void;
  applyOutcomes: (outcomes: SendOutcome[]) => void;
  requeueFailed: () => void;
  resetRun: () => void;
}

export function activeSheet(state: Pick<MergeState, "workbook">): SheetData | null {
  return state.workbook?.sheets[0] ?? null;
}

/** A stable fingerprint of the parts of a sheet that get saved: headers, email column and rows. */
export function listSignature(sheet: Pick<SheetData, "headers" | "rows">, emailColumn: string): string {
  return JSON.stringify([sheet.headers, emailColumn, sheet.rows.map((r) => sheet.headers.map((h) => r[h] ?? ""))]);
}

export function sendableRecipients(state: Pick<MergeState, "recipients" | "excluded">): Recipient[] {
  return state.recipients.filter((r) => !state.excluded.has(r.id) && !isBlocked(r));
}

/** Rows still waiting to go out in the current run. */
export function pendingIds(run: RunState): string[] {
  return run.queue.filter((id) => !(id in run.results));
}

function rebuild(sheet: SheetData | null, column: string | null) {
  if (!sheet || !column) return { recipients: [] as Recipient[], excluded: new Set<string>() };
  const recipients = buildRecipients(sheet, column);
  return { recipients, excluded: defaultExcluded(recipients) };
}

/** What a freshly loaded list starts with: no saved name, no preview, no run. */
const NO_SAVED = { savedListName: null, savedSignature: null, previewId: null, run: IDLE_RUN };
/** The same, with no column or recipients either. */
const NO_LIST = { emailColumn: null, recipients: [] as Recipient[], excluded: new Set<string>(), ...NO_SAVED };

const initial = {
  session: null,
  sessionLoading: true,
  testSent: false,
  workspaces: null as WorkspaceSummary[] | null,
  activeWorkspaceId: null as string | null,
  workbook: null,
  tabSource: null,
  tabChoice: [] as number[],
  emailColumn: null,
  recipients: [] as Recipient[],
  excluded: new Set<string>(),
  savedListName: null as string | null,
  savedSignature: null as string | null,
  subject: "",
  body: "",
  fallbacks: {} as Fallbacks,
  step: "connect" as StepId,
  previewId: null,
  run: IDLE_RUN,
};

export const useMergeStore = create<MergeState>((set, get) => ({
  ...initial,

  setSession: (session) =>
    set((s) => {
      const sameAccount = Boolean(session?.account) && session?.account === s.session?.account;
      return {
        session,
        sessionLoading: false,
        // A different mailbox or alias invalidates an earlier test email.
        testSent: session?.connected && s.session?.connected && session.profile?.user === s.session.profile?.user ? s.testSent : false,
        // Workspaces belong to the signed-in account, not the mailbox. Only another account drops them.
        ...(sameAccount
          ? {}
          : { workspaces: null, activeWorkspaceId: null, savedListName: null, savedSignature: null, step: s.step === "workspaces" ? ("connect" as StepId) : s.step }),
      };
    }),
  setSessionLoading: (sessionLoading) => set({ sessionLoading }),
  markTestSent: () => set({ testSent: true }),
  setProfile: (profile) =>
    set((s) => (s.session?.connected ? { session: { ...s.session, profile }, testSent: false } : {})),
  applyTemplate: ({ subject, body, fallbacks }) => set({ subject, body, fallbacks: { ...fallbacks } }),

  setWorkspaces: (workspaces, preferId) =>
    set((s) => {
      const user = s.session?.account;
      const wanted = preferId === undefined ? s.activeWorkspaceId : preferId;
      const stored = user && typeof window !== "undefined" ? rememberedWorkspace(user) : null;
      const pick = [wanted, stored].find((id) => id && workspaces.some((w) => w.id === id)) ?? workspaces[0]?.id ?? null;
      remember(user, pick);
      // A workspace that went away takes its saved list with it.
      const detach = pick !== s.activeWorkspaceId ? { savedListName: null, savedSignature: null } : {};
      return { workspaces, activeWorkspaceId: pick, ...detach };
    }),
  switchWorkspace: (id) =>
    set((s) => {
      if (id === s.activeWorkspaceId) return {};
      remember(s.session?.account, id);
      return { activeWorkspaceId: id, savedListName: null, savedSignature: null };
    }),

  loadWorkbook: (workbook) => {
    if (workbook.sheets.length > 1) {
      set({ workbook: null, tabSource: workbook, tabChoice: [], ...NO_LIST });
      return;
    }
    const sheet = workbook.sheets[0] ?? null;
    const column = sheet ? detectEmailColumn(sheet.headers, sheet.rows) : null;
    set({ workbook, tabSource: null, tabChoice: [], emailColumn: column, ...rebuild(sheet, column), ...NO_SAVED });
  },

  loadSample: () => {
    const data = new TextEncoder().encode(SAMPLE_CSV);
    get().loadWorkbook(parseSpreadsheet("kitepost-sample.csv", data.buffer as ArrayBuffer));
    const { subject, body } = get();
    if (!subject.trim() && !body.trim()) set({ subject: SAMPLE_SUBJECT, body: SAMPLE_BODY });
  },

  chooseTabs: (indices, { addSource }) => {
    const source = get().tabSource;
    if (!source) return;
    const chosen = [...new Set(indices)].sort((a, b) => a - b);
    const sheets = chosen
      .map((i) => source.sheets[i])
      .filter((sheet): sheet is SheetData => sheet !== undefined);
    if (sheets.length === 0) return;
    const sheet = combineSheets(sheets, { addSource });
    const column = detectEmailColumn(sheet.headers, sheet.rows);
    set({
      workbook: { fileName: source.fileName, sheets: [sheet] },
      tabChoice: chosen,
      emailColumn: column,
      ...rebuild(sheet, column),
      ...NO_SAVED,
    });
  },

  changeTabs: () => {
    if (!get().tabSource) return;
    set({ workbook: null, ...NO_LIST });
  },

  setEmailColumn: (column) => {
    const sheet = activeSheet(get());
    set({ emailColumn: column, ...rebuild(sheet, column), previewId: null, run: IDLE_RUN });
  },

  clearWorkbook: () => set({ workbook: null, tabSource: null, tabChoice: [], ...NO_LIST }),

  toggleExcluded: (id) => {
    const { recipients, excluded } = get();
    const row = recipients.find((r) => r.id === id);
    if (!row || isBlocked(row)) return;
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ excluded: next });
  },

  setAllIncluded: (included) => {
    const { recipients } = get();
    set({
      excluded: included
        ? new Set(recipients.filter((r) => r.issues.length > 0).map((r) => r.id))
        : new Set(recipients.map((r) => r.id)),
    });
  },

  setSavedListName: (savedListName) => {
    const sheet = activeSheet(get());
    const { emailColumn } = get();
    set({
      savedListName,
      savedSignature: savedListName !== null && sheet && emailColumn ? listSignature(sheet, emailColumn) : null,
    });
  },

  addRow: (values) => {
    const { workbook, emailColumn, excluded } = get();
    const sheet = activeSheet(get());
    if (!workbook || !sheet || !emailColumn) return null;

    const row = Object.fromEntries(sheet.headers.map((h) => [h, (values[h] ?? "").trim()]));
    const nextSheet: SheetData = {
      ...sheet,
      rows: [...sheet.rows, row],
      rowNumbers: [...sheet.rowNumbers, (sheet.rowNumbers.at(-1) ?? 1) + 1],
    };
    const rebuilt = buildRecipients(nextSheet, emailColumn);
    const added = rebuilt[rebuilt.length - 1];
    // Existing ids are positions and the new row goes last, so earlier choices still line up.
    const nextExcluded = new Set(excluded);
    if (added.issues.length > 0) nextExcluded.add(added.id);

    set({
      workbook: { ...workbook, sheets: [nextSheet] },
      recipients: rebuilt,
      excluded: nextExcluded,
      previewId: null,
      run: IDLE_RUN,
    });
    return added.id;
  },

  removeRows: (ids) => {
    const { workbook, emailColumn, recipients, excluded } = get();
    const sheet = activeSheet(get());
    if (!workbook || !sheet || !emailColumn || ids.length === 0) return;
    const drop = new Set(ids);
    const keep = recipients.map((r) => !drop.has(r.id));
    if (keep.every(Boolean)) return;

    const nextSheet: SheetData = {
      ...sheet,
      rows: sheet.rows.filter((_, i) => keep[i]),
      rowNumbers: sheet.rowNumbers.filter((_, i) => keep[i]),
    };
    const sheets = [nextSheet];

    // Rows are numbered by position, so carry each survivor's choice over to its new id.
    const survivors = recipients.filter((_, i) => keep[i]);
    const rebuilt = buildRecipients(nextSheet, emailColumn);
    const nextExcluded = new Set<string>();
    rebuilt.forEach((r, i) => {
      const before = survivors[i];
      // Flagged rows start excluded. A clean row keeps its choice, and a former
      // duplicate whose twin was removed is clean now, so it is included again.
      if (r.issues.length > 0 || (before.issues.length === 0 && excluded.has(before.id))) nextExcluded.add(r.id);
    });

    set({
      workbook: { ...workbook, sheets },
      recipients: rebuilt,
      excluded: nextExcluded,
      previewId: null,
      run: IDLE_RUN,
    });
  },

  setSubject: (subject) => set({ subject }),
  setBody: (body) => set({ body }),
  setFallback: (key, value) =>
    set((s) => {
      const next = { ...s.fallbacks };
      if (value.trim() === "") delete next[key];
      else next[key] = value;
      return { fallbacks: next };
    }),

  setStep: (step) => set({ step }),
  setPreviewId: (previewId) => set({ previewId }),

  startRun: (ids) => set({ run: { status: "running", runId: newRunId(), queue: ids, results: {}, fatal: null } }),
  setRunStatus: (status, fatal = null) => set((s) => ({ run: { ...s.run, status, fatal } })),
  applyOutcomes: (outcomes) =>
    set((s) => {
      const results = { ...s.run.results };
      for (const o of outcomes) {
        if (o.status === "sent") results[o.rowId] = { status: "sent" };
        else if (o.status === "failed") results[o.rowId] = { status: "failed", error: o.error };
      }
      return { run: { ...s.run, results } };
    }),
  requeueFailed: () =>
    set((s) => {
      const results = Object.fromEntries(Object.entries(s.run.results).filter(([, r]) => r.status !== "failed"));
      return { run: { ...s.run, results, status: "running", fatal: null } };
    }),
  resetRun: () => set({ run: IDLE_RUN }),
}));

/** Test helper: return the store to a clean slate. */
export function resetMergeStore(): void {
  useMergeStore.setState({ ...initial, excluded: new Set<string>(), run: IDLE_RUN });
}
