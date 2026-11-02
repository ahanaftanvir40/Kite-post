import { htmlToText } from "@/lib/mail/htmlToText";
import { analyzeTemplate, listFields, renderMessage, type Fallbacks, type FieldDef, type TemplateAnalysis } from "@/lib/merge";
import type { Recipient } from "@/lib/spreadsheet";
import type { OutgoingMessage } from "./api";
import type { RowResult, RunState } from "./store";

export function bodyIsEmpty(html: string): boolean {
  return htmlToText(html).trim() === "";
}

export function fieldsFor(headers: string[]): FieldDef[] {
  return listFields(headers);
}

export function analyze(subject: string, body: string, fields: FieldDef[]): TemplateAnalysis {
  return analyzeTemplate([subject, body], fields);
}

export interface MergedRow {
  recipient: Recipient;
  message: OutgoingMessage;
  /** Field keys that resolved to nothing and have no fallback. */
  empty: string[];
}

export function mergeRows(
  recipients: Recipient[],
  subject: string,
  body: string,
  fallbacks: Fallbacks,
): MergedRow[] {
  return recipients.map((recipient) => {
    const rendered = renderMessage(subject, body, recipient.values, fallbacks);
    return {
      recipient,
      empty: rendered.empty,
      message: { rowId: recipient.id, to: recipient.email, subject: rendered.subject, html: rendered.html },
    };
  });
}

export type CheckLevel = "ok" | "warn" | "block";

export interface PreflightCheck {
  id: string;
  level: CheckLevel;
  text: string;
}

export interface PreflightInput {
  connected: boolean;
  user?: string;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string;
  quotaLabel?: string;
  sendableCount: number;
  maxRecipients: number;
  subject: string;
  body: string;
  analysis: TemplateAnalysis;
  emptyRows: number;
  testSent: boolean;
}

export function preflight(input: PreflightInput): { checks: PreflightCheck[]; canSend: boolean } {
  const checks: PreflightCheck[] = [];
  const add = (id: string, level: CheckLevel, text: string) => checks.push({ id, level, text });

  if (!input.connected) {
    add("connected", "block", "Connect your mailbox first.");
  } else {
    add("connected", "ok", `Connected as ${input.user}.`);
    const name = input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress;
    add("sender", "ok", `Sending as ${name}. Replies go to ${input.replyTo}.`);
  }

  if (input.sendableCount === 0) {
    add("recipients", "block", "No recipients are ready to send. Upload a file and check the rows.");
  } else if (input.sendableCount > input.maxRecipients) {
    add(
      "recipients",
      "block",
      `${input.sendableCount} recipients is over the limit of ${input.maxRecipients} per run. Exclude some rows or split the file.`,
    );
  } else {
    add("recipients", "ok", `${input.sendableCount} ${input.sendableCount === 1 ? "recipient" : "recipients"} ready.`);
  }

  if (input.subject.trim() === "") add("subject", "block", "The subject is empty.");
  if (bodyIsEmpty(input.body)) add("body", "block", "The message body is empty.");

  if (input.analysis.unknown.length > 0) {
    const names = input.analysis.unknown
      .map((u) => (u.suggestion ? `@${u.raw} (did you mean @${u.suggestion}?)` : `@${u.raw}`))
      .join(", ");
    add("tokens", "block", `These tokens match no column: ${names}.`);
  } else if (input.analysis.used.length > 0) {
    add("tokens", "ok", `Every token matches a column (${input.analysis.used.map((k) => `@${k}`).join(", ")}).`);
  }

  if (input.emptyRows > 0) {
    add(
      "empty",
      "warn",
      `${input.emptyRows} ${input.emptyRows === 1 ? "row has" : "rows have"} an empty value for a token and no fallback. Those messages will have a gap.`,
    );
  }

  if (input.connected) {
    add(
      "test",
      input.testSent ? "ok" : "warn",
      input.testSent
        ? "Test email sent. Check that the From line shows your alias."
        : "No test email yet. Send one to yourself to confirm the From alias holds.",
    );
    if (input.quotaLabel) add("quota", "ok", `Gmail allows ${input.quotaLabel}. This is an estimate, not a guarantee.`);
  }

  return { checks, canSend: !checks.some((c) => c.level === "block") };
}

function csvCell(value: string): string {
  // A leading = + - @ makes spreadsheets treat the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function resultsToCsv(recipients: Recipient[], run: RunState): string {
  // Numbered the way the Recipients table shows them: 1, 2, 3 in list order.
  const byId = new Map(recipients.map((r, i) => [r.id, { r, position: i + 1 }]));
  const lines = [["row", "email", "status", "detail"].join(",")];
  for (const id of run.queue) {
    const entry = byId.get(id);
    if (!entry) continue;
    const { r: recipient, position } = entry;
    const result: RowResult | undefined = run.results[id];
    const status = result ? result.status : "pending";
    lines.push(
      [String(position), csvCell(recipient.email), status, csvCell(result?.error ?? "")].join(","),
    );
  }
  return lines.join("\r\n");
}

export function runCounts(run: RunState) {
  let sent = 0;
  let failed = 0;
  for (const id of run.queue) {
    const r = run.results[id];
    if (r?.status === "sent") sent++;
    else if (r?.status === "failed") failed++;
  }
  return { total: run.queue.length, sent, failed, pending: run.queue.length - sent - failed };
}
