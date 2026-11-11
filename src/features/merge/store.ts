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
import type { ListTab, RecipientListInput } from "@/lib/db/types";
import { newRunId, type SessionStatus, type WorkspaceSummary } from "./api";

export type FlowStepId = "connect" | "recipients" | "compose" | "send";
/**
 * The numbered flow, plus views that are never a "next" step: History, Workspaces, and the loaded
 * file ("selected"), which belongs to Recipients but lives on its own tab once a file is chosen.
 */
export type StepId = FlowStepId | "selected" | "history" | "workspaces";

/** The numbered step a view sits under. The loaded file counts as Recipients. */
export function flowStepOf(step: StepId): FlowStepId | null {
  if (step === "selected") return "recipients";
  return step === "history" || step === "workspaces" ? null : step;
}

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

/** What a tab of a kept workbook was left as when another tab was opened, so coming back finds it unchanged. */
interface TabStash {
  sheet: SheetData;
  excluded: Set<string>;
  emailColumn: string | null;
}

export interface MergeState {
  session: SessionStatus | null;
  sessionLoading: boolean;
  testSent: boolean;

  /** Null until loaded. Only meaningful when the server can save. */
  workspaces: WorkspaceSummary[] | null;
  /** The folder saved lists, templates and history belong to. Null when none is chosen. */
  activeWorkspaceId: string | null;
  /** Goes up whenever a list is saved in the background, so lists on screen know to load again. */
  listsStamp: number;

  /** The list being worked on. Always one sheet: a single tab, or several tabs stacked. */
  workbook: ParsedWorkbook | null;
  /** The file as uploaded when it has several tabs, kept so the choice of tabs can be changed. */
  tabSource: ParsedWorkbook | null;
  /** Which tabs of `tabSource` are in use, so changing tabs starts from the same ticks. */
  tabChoice: number[];
  /**
   * Set when the workbook is kept as it is: these tabs of `tabSource` stay together and the Selected file
   * view switches between them. Null when a single tab, or several stacked into one list, is in use.
   */
  workbookTabs: number[] | null;
  /** The tab of `tabSource` showing now, in a kept workbook. */
  activeTab: number;
  /** The other tabs of a kept workbook, as they were left, by tab index. */
  tabStash: Record<number, TabStash>;
  emailColumn: string | null;
  recipients: Recipient[];
  excluded: Set<string>;
  /** Name of the saved list this sheet came from or was last saved as, if any. */
  savedListName: string | null;
  /** What the saved list holds right now, to tell whether there is anything new to save. */
  savedSignature: string | null;
  /** The saved list whose tabs are being changed: the tab choice updates it rather than saving a new list. */
  changingList: string | null;

  subject: string;
  body: string;
  fallbacks: Fallbacks;
  /** Name of the saved template this message came from or was last saved as, if any. */
  savedTemplateName: string | null;
  /** What that template holds, to tell whether the message has changes to save. */
  savedTemplateSignature: string | null;

  step: StepId;
  previewId: string | null;
  run: RunState;

  setSession: (session: SessionStatus | null) => void;
  setSessionLoading: (loading: boolean) => void;
  markTestSent: () => void;
  /** Switch the From / Reply-To pair. A new alias needs a fresh test email. */
  setProfile: (profile: PublicProfile) => void;
  /** Replace the message with a saved template, and mark it as the one in use. */
  applyTemplate: (template: { name: string; subject: string; body: string; fallbacks: Fallbacks }) => void;
  /** Mark the message as saved under this name (or as no template), keeping a fingerprint of it. */
  setSavedTemplateName: (name: string | null) => void;

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
  /** Keep these tabs of `tabSource` together as a workbook, opening the first one. */
  keepTabs: (indices: number[]) => void;
  /**
   * Open a workbook saved as one list, tab switcher and all. `emailColumns` holds the saved email column of
   * each sheet ("" for none), and `name` is the list it came from, so saving again updates it.
   */
  openSavedWorkbook: (workbook: ParsedWorkbook, emailColumns: string[], name: string) => void;
  /** Show another tab of a kept workbook. The tab being left keeps its edits. */
  switchTab: (index: number) => void;
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
  /** Tell lists on screen that a saved list was added or changed. */
  touchLists: () => void;

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

type SavableSource = Pick<MergeState, "workbook" | "emailColumn" | "tabSource" | "workbookTabs" | "activeTab" | "tabStash">;
type Savable = Pick<RecipientListInput, "headers" | "emailColumn" | "rows" | "tabs">;

/** Every tab of a kept workbook as it stands now: the open one as shown, the others as they were left. */
function keptTabs(s: SavableSource): ListTab[] {
  const { tabSource: source, workbookTabs } = s;
  if (!source || !workbookTabs) return [];
  return workbookTabs.flatMap((i) => {
    const open = i === s.activeTab;
    const stashed = s.tabStash[i];
    const sheet = open ? activeSheet(s) : (stashed?.sheet ?? source.sheets[i]);
    if (!sheet) return [];
    const column = open ? s.emailColumn : stashed ? stashed.emailColumn : detectEmailColumn(sheet.headers, sheet.rows);
    return [{ name: source.sheets[i]?.name || sheet.name, headers: sheet.headers, emailColumn: column ?? "", rows: sheet.rows }];
  });
}

/** A workbook list from its tabs: the first tab with people in it stands for the list. Null when it cannot be saved. */
function asWorkbookList(tabs: ListTab[]): Savable | null {
  const main = tabs.find((t) => t.emailColumn !== "" && t.rows.length > 0 && t.headers.length > 0);
  if (tabs.length < 2 || !main || !tabs.every((t) => t.headers.length > 0)) return null;
  return { headers: main.headers, emailColumn: main.emailColumn, rows: main.rows, tabs };
}

/** What saving one sheet would store, before it is opened. Null when it has no email column to save against. */
export function sheetSavable(sheet: SheetData): Savable | null {
  const emailColumn = detectEmailColumn(sheet.headers, sheet.rows);
  return emailColumn && sheet.headers.length > 0 ? { headers: sheet.headers, emailColumn, rows: sheet.rows } : null;
}

/** What keeping these tabs of a file together would save, straight from the file, before it is opened. */
export function workbookSavable(source: ParsedWorkbook, indices: number[]): Savable | null {
  const tabs = [...new Set(indices)]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const sheet = source.sheets[i];
      if (!sheet) return [];
      return [{ name: sheet.name, headers: sheet.headers, emailColumn: detectEmailColumn(sheet.headers, sheet.rows) ?? "", rows: sheet.rows }];
    });
  return asWorkbookList(tabs);
}

/**
 * What saving would store: the sheet that is open, or every tab of a kept workbook as one list.
 * Null when there is nothing to save yet (no sheet, or no email column to save against).
 */
export function savableList(s: SavableSource): Savable | null {
  if (s.workbookTabs && s.tabSource) {
    const list = asWorkbookList(keptTabs(s));
    if (list) return list;
  }
  const sheet = activeSheet(s);
  if (!sheet || !s.emailColumn) return null;
  return { headers: sheet.headers, emailColumn: s.emailColumn, rows: sheet.rows };
}

/** A fingerprint of what `savableList` would store, to tell whether the saved copy is out of date. */
export function savableSignature(list: Savable): string {
  const cells = (headers: string[], rows: Savable["rows"]) => rows.map((r) => headers.map((h) => r[h] ?? ""));
  if (list.tabs) return JSON.stringify(list.tabs.map((t) => [t.name, t.headers, t.emailColumn, cells(t.headers, t.rows)]));
  return listSignature({ headers: list.headers, rows: list.rows }, list.emailColumn);
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

/** A fingerprint of a message and its fallbacks, to tell whether the saved template is out of date. */
export function templateSignature({ subject, body, fallbacks }: { subject: string; body: string; fallbacks: Fallbacks }): string {
  // A blank fallback means "none", so it counts the same as no fallback at all.
  const used = Object.entries(fallbacks)
    .filter(([, value]) => value.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([subject, body, used]);
}

/** Templates belong to a workspace, so leaving one leaves its template behind. */
const NO_TEMPLATE = { savedTemplateName: null, savedTemplateSignature: null };

/** What a freshly loaded list starts with: no saved name, no preview, no run. */
const NO_SAVED = { savedListName: null, savedSignature: null, changingList: null, previewId: null, run: IDLE_RUN };
/** Not a kept workbook: no tabs switching, nothing stashed. */
const NO_TABS = { workbookTabs: null, activeTab: 0, tabStash: {} as Record<number, TabStash> };
/** The same, with no column or recipients either. */
const NO_LIST = { emailColumn: null, recipients: [] as Recipient[], excluded: new Set<string>(), ...NO_SAVED, ...NO_TABS };

/**
 * One tab of a kept workbook, ready to show: restored as it was left if it was opened before, otherwise
 * read fresh from the file. The workbook stays one file whichever tab shows, so it is saved, listed and
 * sent from as one file. Whether it is saved belongs to the workbook, so that is not touched here.
 */
function tabView(source: ParsedWorkbook, index: number, stash: Record<number, TabStash>) {
  const kept = stash[index];
  const sheet = kept?.sheet ?? source.sheets[index];
  const column = kept ? kept.emailColumn : sheet ? detectEmailColumn(sheet.headers, sheet.rows) : null;
  const built = rebuild(sheet ?? null, column);
  return {
    workbook: { fileName: source.fileName, sheets: sheet ? [sheet] : [] },
    activeTab: index,
    emailColumn: column,
    recipients: built.recipients,
    excluded: kept?.excluded ?? built.excluded,
    previewId: null,
    run: IDLE_RUN,
  };
}

/** Choosing a file from the Recipients screen opens it on its own tab; from anywhere else the view stays put. */
const openFile = (step: StepId): StepId => (step === "recipients" ? "selected" : step);
/** With no file there is nothing to show on its tab, so go back to choosing one. */
const closeFile = (step: StepId): StepId => (step === "selected" ? "recipients" : step);

const initial = {
  session: null,
  sessionLoading: true,
  testSent: false,
  workspaces: null as WorkspaceSummary[] | null,
  activeWorkspaceId: null as string | null,
  listsStamp: 0,
  workbook: null,
  tabSource: null,
  tabChoice: [] as number[],
  ...NO_TABS,
  emailColumn: null,
  recipients: [] as Recipient[],
  excluded: new Set<string>(),
  savedListName: null as string | null,
  savedSignature: null as string | null,
  changingList: null as string | null,
  subject: "",
  body: "",
  fallbacks: {} as Fallbacks,
  ...NO_TEMPLATE,
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
          : {
              workspaces: null,
              activeWorkspaceId: null,
              savedListName: null,
              savedSignature: null,
              changingList: null,
              ...NO_TEMPLATE,
              step: s.step === "workspaces" ? ("connect" as StepId) : s.step,
            }),
      };
    }),
  setSessionLoading: (sessionLoading) => set({ sessionLoading }),
  markTestSent: () => set({ testSent: true }),
  setProfile: (profile) =>
    set((s) => (s.session?.connected ? { session: { ...s.session, profile }, testSent: false } : {})),
  applyTemplate: ({ name, subject, body, fallbacks }) =>
    set({
      subject,
      body,
      fallbacks: { ...fallbacks },
      savedTemplateName: name,
      savedTemplateSignature: templateSignature({ subject, body, fallbacks }),
    }),
  setSavedTemplateName: (name) =>
    set((s) => ({
      savedTemplateName: name,
      savedTemplateSignature: name === null ? null : templateSignature(s),
    })),

  setWorkspaces: (workspaces, preferId) =>
    set((s) => {
      const user = s.session?.account;
      const wanted = preferId === undefined ? s.activeWorkspaceId : preferId;
      const stored = user && typeof window !== "undefined" ? rememberedWorkspace(user) : null;
      const pick = [wanted, stored].find((id) => id && workspaces.some((w) => w.id === id)) ?? workspaces[0]?.id ?? null;
      remember(user, pick);
      // A workspace that went away takes its saved list with it.
      const detach = pick !== s.activeWorkspaceId ? { savedListName: null, savedSignature: null, changingList: null, ...NO_TEMPLATE } : {};
      return { workspaces, activeWorkspaceId: pick, ...detach };
    }),
  switchWorkspace: (id) =>
    set((s) => {
      if (id === s.activeWorkspaceId) return {};
      remember(s.session?.account, id);
      return { activeWorkspaceId: id, savedListName: null, savedSignature: null, changingList: null, ...NO_TEMPLATE };
    }),

  loadWorkbook: (workbook) => {
    if (workbook.sheets.length > 1) {
      set({ workbook: null, tabSource: workbook, tabChoice: [], ...NO_LIST });
      return;
    }
    const sheet = workbook.sheets[0] ?? null;
    const column = sheet ? detectEmailColumn(sheet.headers, sheet.rows) : null;
    set((s) => ({
      workbook,
      tabSource: null,
      tabChoice: [],
      ...NO_TABS,
      emailColumn: column,
      ...rebuild(sheet, column),
      ...NO_SAVED,
      step: openFile(s.step),
    }));
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
    set((s) => ({
      workbook: { fileName: source.fileName, sheets: [sheet] },
      tabChoice: chosen,
      ...NO_TABS,
      emailColumn: column,
      ...rebuild(sheet, column),
      ...NO_SAVED,
      step: openFile(s.step),
    }));
  },

  keepTabs: (indices) => {
    const source = get().tabSource;
    if (!source) return;
    const chosen = [...new Set(indices)].filter((i) => source.sheets[i] !== undefined).sort((a, b) => a - b);
    const [first] = chosen;
    if (first === undefined) return;
    set((s) => ({ workbookTabs: chosen, tabChoice: chosen, tabStash: {}, ...NO_SAVED, ...tabView(source, first, {}), step: openFile(s.step) }));
  },

  openSavedWorkbook: (workbook, emailColumns, name) => {
    const all = workbook.sheets.map((_, i) => i);
    const first = all[0];
    if (first === undefined) return;
    const stash: Record<number, TabStash> = {};
    for (const i of all.slice(1)) {
      const sheet = workbook.sheets[i];
      const column = emailColumns[i] && sheet.headers.includes(emailColumns[i]) ? emailColumns[i] : null;
      stash[i] = { sheet, excluded: rebuild(sheet, column).excluded, emailColumn: column };
    }
    const sheet = workbook.sheets[first];
    const column = emailColumns[first] && sheet.headers.includes(emailColumns[first]) ? emailColumns[first] : null;
    set((s) => ({
      tabSource: workbook,
      workbookTabs: all,
      tabChoice: all,
      tabStash: stash,
      changingList: null,
      ...tabView(workbook, first, { [first]: { sheet, excluded: rebuild(sheet, column).excluded, emailColumn: column } }),
      step: openFile(s.step),
    }));
    get().setSavedListName(name);
  },

  switchTab: (index) =>
    set((s) => {
      const source = s.tabSource;
      const sheet = activeSheet(s);
      if (!source || !sheet || !s.workbookTabs?.includes(index) || index === s.activeTab) return {};
      const left: TabStash = { sheet, excluded: s.excluded, emailColumn: s.emailColumn };
      const stash = { ...s.tabStash, [s.activeTab]: left };
      return { tabStash: stash, ...tabView(source, index, stash) };
    }),

  changeTabs: () => {
    if (!get().tabSource) return;
    // The tab choice is shown on Recipients, so that is where this goes.
    // The saved list stays the one being edited, so the new choice updates it instead of adding a copy.
    set((s) => ({ workbook: null, ...NO_LIST, changingList: s.savedListName, step: closeFile(s.step) }));
  },

  setEmailColumn: (column) => {
    const sheet = activeSheet(get());
    set({ emailColumn: column, ...rebuild(sheet, column), previewId: null, run: IDLE_RUN });
  },

  clearWorkbook: () => set((s) => ({ workbook: null, tabSource: null, tabChoice: [], ...NO_LIST, step: closeFile(s.step) })),

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

  touchLists: () => set((s) => ({ listsStamp: s.listsStamp + 1 })),

  setSavedListName: (savedListName) => {
    const list = savableList(get());
    set({ savedListName, savedSignature: savedListName !== null && list ? savableSignature(list) : null });
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
