import type { ProviderId } from "@/lib/mail/providers";

export type Row = Record<string, string>;

/** What a workspace holds. Shown on its card so people know what is inside before opening it. */
export interface WorkspaceCounts {
  lists: number;
  templates: number;
  runs: number;
}
export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: string;
  counts: WorkspaceCounts;
}

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  fallbacks: Record<string, string>;
}
export interface TemplateRecord extends TemplateInput {
  id: string;
  updatedAt: string;
}

export interface RecipientListInput {
  name: string;
  fileName: string;
  headers: string[];
  emailColumn: string;
  rows: Row[];
}
export interface RecipientListSummary {
  id: string;
  name: string;
  fileName: string;
  headers: string[];
  emailColumn: string;
  rowCount: number;
  updatedAt: string;
  /** When the list was marked as already done or sent. Absent while it is still to do. */
  doneAt?: string;
}
export interface RecipientListRecord extends RecipientListSummary {
  rows: Row[];
}

/** What Google tells us about the person who signed in. */
export interface AccountProfile {
  name: string;
  image?: string;
}
export interface UserRecord extends AccountProfile {
  /** The Google account email, lower-cased. The key everything else hangs off. */
  email: string;
  createdAt: string;
  lastSeenAt: string;
}

/**
 * The mailbox a signed-in user connected, kept so it survives the 2-hour cookie and new
 * devices. `secret` is the app password already encrypted; a Store never sees it in the clear.
 */
export interface ConnectionInput {
  user: string;
  secret: string;
  preset: ProviderId;
  fromName: string;
  fromAddress: string;
  replyTo: string;
}
export interface ConnectionRecord extends ConnectionInput {
  updatedAt: string;
}

/** A From / Reply-To combination. Never holds a password. */
export interface SenderInput {
  fromName: string;
  fromAddress: string;
  replyTo: string;
}
export interface SenderRecord extends SenderInput {
  id: string;
  lastUsedAt: string;
}

export interface MessageLogInput {
  rowId: string;
  to: string;
  subject: string;
  status: "sent" | "failed";
  error?: string;
}
export interface MessageLogRecord extends MessageLogInput {
  at: string;
}

export interface RunContext {
  runId: string;
  /** The subject template as written, not a merged one. */
  subject: string;
  fromAddress: string;
  /** The spreadsheet the recipients came from. Absent when the run did not come from a file. */
  fileName?: string;
}
export interface RunSummary {
  runId: string;
  subject: string;
  fromAddress: string;
  /** The spreadsheet this run was sent from. Absent on runs recorded before files were tracked. */
  fileName?: string;
  startedAt: string;
  finishedAt: string;
  sent: number;
  failed: number;
}

export const LIMITS = {
  workspaces: 20,
  /** Templates, lists and runs are capped per workspace. Senders are capped per mailbox. */
  templates: 100,
  lists: 20,
  senders: 25,
  runs: 50,
  historyDays: 180,
} as const;

export type LimitKind = "workspaces" | "templates" | "lists" | "senders";

/** Name given to the workspace that adopts anything saved before workspaces existed. */
export const LEGACY_WORKSPACE_NAME = "General";

/** Name of the workspace every mailbox gets when it has none, so there is always somewhere to work. */
export const STARTER_WORKSPACE_NAME = "My workspace";

/** Thrown when deleting a workspace would leave its owner with none. The message is safe to show. */
export class StoreLastWorkspaceError extends Error {
  constructor() {
    super("You need at least one workspace, so this one can't be deleted. Create another first if you want to remove it.");
    this.name = "StoreLastWorkspaceError";
  }
}

/** Thrown when an owner has hit a cap. The message is safe to show. */
export class StoreLimitError extends Error {
  constructor(kind: LimitKind) {
    const what = kind === "workspaces" ? "workspaces" : `saved ${kind}`;
    super(`You have reached the limit of ${LIMITS[kind]} ${what}. Delete one to make room.`);
    this.name = "StoreLimitError";
  }
}

/** Thrown when a write targets a workspace that does not exist, or belongs to someone else. */
export class StoreNotFoundError extends Error {
  constructor() {
    super("That workspace no longer exists.");
    this.name = "StoreNotFoundError";
  }
}

/** Thrown when a name is already taken. The message is safe to show. */
export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreConflictError";
  }
}

/**
 * Everything is scoped by `owner`, the Google account that signed in.
 * Implementations must never return another owner's data.
 */
export interface Store {
  /**
   * Remember who signed in. The first time an owner is seen, they are given a starter
   * workspace, so a new account always has somewhere to work.
   */
  recordUser(owner: string, profile: AccountProfile): Promise<void>;
  getUser(owner: string): Promise<UserRecord | null>;

  /** One connected mailbox per account. Saving again replaces it. */
  saveConnection(owner: string, input: ConnectionInput): Promise<void>;
  getConnection(owner: string): Promise<ConnectionRecord | null>;
  deleteConnection(owner: string): Promise<boolean>;

  /**
   * Also moves anything saved before workspaces existed into a workspace called "General",
   * and gives an owner who has no workspace at all a starter one. So this never returns an empty list.
   */
  listWorkspaces(owner: string): Promise<WorkspaceSummary[]>;
  getWorkspace(owner: string, id: string): Promise<WorkspaceSummary | null>;
  createWorkspace(owner: string, name: string): Promise<WorkspaceSummary>;
  /** Null when the workspace does not exist. */
  renameWorkspace(owner: string, id: string, name: string): Promise<WorkspaceSummary | null>;
  /**
   * Removes the workspace and everything inside it: lists, templates and send history.
   * False when it does not exist. Throws StoreLastWorkspaceError for an owner's only workspace.
   */
  deleteWorkspace(owner: string, id: string): Promise<boolean>;

  // Templates, lists and history live inside a workspace. Reads and deletes
  // against a workspace id that belongs to someone else, or to nobody, match
  // nothing. Writes are refused with StoreNotFoundError.
  listTemplates(owner: string, workspaceId: string): Promise<TemplateRecord[]>;
  saveTemplate(owner: string, workspaceId: string, input: TemplateInput): Promise<TemplateRecord>;
  deleteTemplate(owner: string, workspaceId: string, id: string): Promise<boolean>;

  listLists(owner: string, workspaceId: string): Promise<RecipientListSummary[]>;
  saveList(owner: string, workspaceId: string, input: RecipientListInput): Promise<RecipientListSummary>;
  getList(owner: string, workspaceId: string, id: string): Promise<RecipientListRecord | null>;
  deleteList(owner: string, workspaceId: string, id: string): Promise<boolean>;
  /** Mark a list as done (or move it back to to-do, which also counts as an edit). Null when there is no such list. */
  setListDone(owner: string, workspaceId: string, id: string, done: boolean): Promise<RecipientListSummary | null>;

  // Sender aliases belong to the mailbox, not to a workspace.
  listSenders(owner: string): Promise<SenderRecord[]>;
  saveSender(owner: string, input: SenderInput): Promise<SenderRecord>;
  getSender(owner: string, id: string): Promise<SenderRecord | null>;
  touchSender(owner: string, id: string): Promise<void>;
  deleteSender(owner: string, id: string): Promise<boolean>;

  logMessages(owner: string, workspaceId: string, run: RunContext, messages: MessageLogInput[]): Promise<void>;
  listRuns(owner: string, workspaceId: string, limit?: number): Promise<RunSummary[]>;
  getRunMessages(owner: string, workspaceId: string, runId: string): Promise<MessageLogRecord[]>;
  /** Remove every send run (and its per-recipient log) made from a spreadsheet. Returns how many runs went. */
  deleteRunsForFile(owner: string, workspaceId: string, fileName: string): Promise<number>;
}

/** Case-insensitive identity used for upserts. */
export function keyOf(value: string): string {
  return value.trim().toLowerCase();
}
