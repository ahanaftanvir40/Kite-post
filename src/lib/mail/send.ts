import { stripLineBreaks } from "@/lib/merge/escape";
import { mapMailError, type MailErrorCode } from "./errors";
import { htmlToText } from "./htmlToText";
import { redactSecrets } from "./redact";
import type { Mailer } from "./transport";

export interface Identity {
  user: string;
  pass: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
}

export interface MessageInput {
  rowId: string;
  to: string;
  subject: string;
  html: string;
}

export type SendOutcome =
  | { rowId: string; status: "sent" }
  | { rowId: string; status: "failed"; code: MailErrorCode; error: string }
  | { rowId: string; status: "skipped" };

export interface SendBatchOptions {
  mailer: Mailer;
  identity: Identity;
  messages: MessageInput[];
  /** Base delay between messages; actual delay is jittered 0.67x to 1.67x. */
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface SendBatchResult {
  outcomes: SendOutcome[];
  /** True when a fatal error stopped the batch early. */
  halted: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function jitter(baseMs: number, random: () => number = Math.random): number {
  if (baseMs <= 0) return 0;
  return Math.round(baseMs * (0.67 + random()));
}

/**
 * Send messages one after another. A row-level failure is recorded and the
 * batch continues; a fatal failure (auth, quota, network) halts it and marks the
 * remaining rows `skipped` so the client can keep them pending.
 */
export async function sendBatch(options: SendBatchOptions): Promise<SendBatchResult> {
  const { mailer, identity, messages, delayMs, sleep = defaultSleep, random = Math.random } = options;
  const outcomes: SendOutcome[] = [];
  let halted = false;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (halted) {
      outcomes.push({ rowId: message.rowId, status: "skipped" });
      continue;
    }
    if (i > 0) await sleep(jitter(delayMs, random));

    try {
      await mailer.sendMail({
        from: { name: stripLineBreaks(identity.fromName), address: identity.fromAddress },
        replyTo: identity.replyTo,
        to: message.to,
        subject: stripLineBreaks(message.subject),
        html: message.html,
        text: htmlToText(message.html),
      });
      outcomes.push({ rowId: message.rowId, status: "sent" });
    } catch (error) {
      const mapped = mapMailError(error);
      outcomes.push({
        rowId: message.rowId,
        status: "failed",
        code: mapped.code,
        error: redactSecrets(mapped.message, [identity.pass]),
      });
      if (mapped.fatal) halted = true;
    }
  }

  return { outcomes, halted };
}
