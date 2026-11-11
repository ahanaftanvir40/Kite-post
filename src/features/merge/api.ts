import type {
  MessageLogRecord,
  RecipientListInput,
  RecipientListRecord,
  RecipientListSummary,
  RunSummary,
  SenderInput,
  SenderRecord,
  TemplateInput,
  TemplateRecord,
  WorkspaceSummary,
} from "@/lib/db/types";
import type { QuotaHint } from "@/lib/mail/providers";
import type { SendBatchResult } from "@/lib/mail/send";
import type { PublicProfile } from "@/lib/session/seal";

export interface SessionStatus {
  connected: boolean;
  /** The signed-in Google account. Present even before a mailbox is connected. */
  account?: string;
  profile?: PublicProfile;
  quota?: QuotaHint;
  accessCodeRequired: boolean;
  localAccountAvailable: boolean;
  maxRecipientsPerRun: number;
  /** True when the server has a database, so saved items and history work. */
  savingAvailable?: boolean;
}

export interface ConnectInput {
  user: string;
  password: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  accessCode?: string;
}

export interface OutgoingMessage {
  rowId: string;
  to: string;
  subject: string;
  html: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach Kitepost. Check your connection and try again.", 0, "network");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body; fall through to the generic message.
  }
  if (!response.ok) {
    const data = (body ?? {}) as { error?: string; code?: string };
    throw new ApiError(data.error ?? "Something went wrong. Try again.", response.status, data.code);
  }
  return body as T;
}

const optional = (value: string) => (value.trim() === "" ? undefined : value.trim());

export function getSession(): Promise<SessionStatus> {
  return request<SessionStatus>("/api/session");
}

export function connect(input: ConnectInput): Promise<SessionStatus> {
  return request<SessionStatus>("/api/session", {
    method: "POST",
    body: JSON.stringify({
      preset: "gmail",
      user: input.user.trim(),
      password: input.password,
      fromName: input.fromName.trim(),
      fromAddress: optional(input.fromAddress),
      replyTo: optional(input.replyTo),
      accessCode: optional(input.accessCode ?? ""),
    }),
  });
}

export function connectLocal(accessCode?: string): Promise<SessionStatus> {
  return request<SessionStatus>("/api/session", {
    method: "POST",
    body: JSON.stringify({ local: true, accessCode: optional(accessCode ?? "") }),
  });
}

export function disconnect(): Promise<{ connected: false }> {
  return request("/api/session", { method: "DELETE" });
}

export interface RunRef {
  runId: string;
  subject: string;
  /** The spreadsheet being sent, so history can show it. */
  fileName?: string;
  /** The tab being sent, when the file has several kept together. */
  tab?: string;
  workspaceId: string;
}

export function sendChunk(messages: OutgoingMessage[], run?: RunRef): Promise<SendBatchResult> {
  return request<SendBatchResult>("/api/send", { method: "POST", body: JSON.stringify({ messages, run }) });
}

/** An id that groups the chunks of one send run in history. Matches the server's allowed characters. */
export function newRunId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `run-${random}`;
}

const saved = (kind: string) => `/api/saved/${kind}`;
/** Templates, lists and history are asked for inside one workspace. */
const inside = (path: string, workspaceId: string) => `${path}${path.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  return (await request<{ items: WorkspaceSummary[] }>("/api/workspaces")).items;
}
export async function createWorkspace(name: string): Promise<WorkspaceSummary> {
  return (await request<{ item: WorkspaceSummary }>("/api/workspaces", { method: "POST", body: JSON.stringify({ name }) })).item;
}
export async function renameWorkspace(id: string, name: string): Promise<WorkspaceSummary> {
  return (await request<{ item: WorkspaceSummary }>(`/api/workspaces/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) })).item;
}
export async function deleteWorkspace(id: string): Promise<void> {
  await request(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listSaved<T>(kind: "templates" | "lists" | "runs", workspaceId: string): Promise<T[]>;
export async function listSaved<T>(kind: "senders"): Promise<T[]>;
export async function listSaved<T>(kind: "templates" | "lists" | "senders" | "runs", workspaceId?: string): Promise<T[]> {
  const url = kind === "senders" || !workspaceId ? saved(kind) : inside(saved(kind), workspaceId);
  return (await request<{ items: T[] }>(url)).items;
}
export const listTemplates = (workspaceId: string) => listSaved<TemplateRecord>("templates", workspaceId);
export const listLists = (workspaceId: string) => listSaved<RecipientListSummary>("lists", workspaceId);
export const listSenders = () => listSaved<SenderRecord>("senders");
export const listRuns = (workspaceId: string) => listSaved<RunSummary>("runs", workspaceId);

export async function saveTemplate(workspaceId: string, input: TemplateInput): Promise<TemplateRecord> {
  return (await request<{ item: TemplateRecord }>(inside(saved("templates"), workspaceId), { method: "POST", body: JSON.stringify(input) })).item;
}
export async function saveList(workspaceId: string, input: RecipientListInput): Promise<RecipientListSummary> {
  return (await request<{ item: RecipientListSummary }>(inside(saved("lists"), workspaceId), { method: "POST", body: JSON.stringify(input) })).item;
}
export async function markListDone(workspaceId: string, id: string, done: boolean): Promise<RecipientListSummary> {
  const path = inside(`${saved("lists")}/${encodeURIComponent(id)}`, workspaceId);
  return (await request<{ item: RecipientListSummary }>(path, { method: "PATCH", body: JSON.stringify({ done }) })).item;
}
/** Remove the send history of one spreadsheet. */
export async function deleteRunsForFile(workspaceId: string, fileName: string): Promise<void> {
  await request(inside(`${saved("runs")}?file=${encodeURIComponent(fileName)}`, workspaceId), { method: "DELETE" });
}
export async function saveSender(input: SenderInput): Promise<SenderRecord> {
  return (await request<{ item: SenderRecord }>(saved("senders"), { method: "POST", body: JSON.stringify(input) })).item;
}
export async function loadList(workspaceId: string, id: string): Promise<RecipientListRecord> {
  return (await request<{ item: RecipientListRecord }>(inside(`${saved("lists")}/${encodeURIComponent(id)}`, workspaceId))).item;
}
export async function loadRunMessages(workspaceId: string, runId: string): Promise<MessageLogRecord[]> {
  return (await request<{ items: MessageLogRecord[] }>(inside(`${saved("runs")}/${encodeURIComponent(runId)}`, workspaceId))).items;
}
export async function switchSender(id: string): Promise<PublicProfile> {
  return (await request<{ profile: PublicProfile }>(`${saved("senders")}/${encodeURIComponent(id)}`, { method: "PUT" })).profile;
}
export async function deleteSaved(kind: "senders", id: string): Promise<void>;
export async function deleteSaved(kind: "templates" | "lists", id: string, workspaceId: string): Promise<void>;
export async function deleteSaved(kind: "templates" | "lists" | "senders", id: string, workspaceId?: string): Promise<void> {
  const path = `${saved(kind)}/${encodeURIComponent(id)}`;
  await request(kind === "senders" || !workspaceId ? path : inside(path, workspaceId), { method: "DELETE" });
}

export interface TestSendResult {
  sentTo: string;
  from: string;
  replyTo: string;
}

export function sendTest(subject: string, html: string): Promise<TestSendResult> {
  return request<TestSendResult>("/api/test-send", { method: "POST", body: JSON.stringify({ subject, html }) });
}

export type { MessageLogRecord, RecipientListRecord, RecipientListSummary, RunSummary, SenderRecord, TemplateRecord, WorkspaceSummary };
