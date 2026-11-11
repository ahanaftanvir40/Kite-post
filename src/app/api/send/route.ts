import type { MessageLogInput, Store } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { json, noStoreHeaders, readJson } from "@/lib/http";
import { sendBatch, type MessageInput, type SendOutcome } from "@/lib/mail/send";
import { createMailer } from "@/lib/mail/transport";
import { sendLimiter } from "@/lib/limiters";
import { clientKey } from "@/lib/rateLimit";
import { requireMailbox } from "@/lib/session/connection";
import type { SessionData } from "@/lib/session/seal";
import { sendSchema } from "@/lib/validation/schemas";

/**
 * Write what happened to send history. The mail has already gone out, so a
 * database failure here is swallowed rather than reported as a send failure.
 */
async function recordHistory(
  store: Store | null,
  owner: string,
  session: SessionData,
  run: { runId: string; subject: string; fileName?: string; tab?: string; workspaceId: string },
  messages: MessageInput[],
  outcomes: SendOutcome[],
): Promise<void> {
  try {
    if (!store) return;
    const byRow = new Map(messages.map((m) => [m.rowId, m]));
    const entries: MessageLogInput[] = [];
    for (const o of outcomes) {
      const message = byRow.get(o.rowId);
      if (!message || o.status === "skipped") continue;
      entries.push({
        rowId: o.rowId,
        to: message.to,
        subject: message.subject,
        status: o.status,
        ...(o.status === "failed" ? { error: o.error } : {}),
      });
    }
    await store.logMessages(owner, run.workspaceId, { runId: run.runId, subject: run.subject, fromAddress: session.fromAddress, fileName: run.fileName, tab: run.tab }, entries);
  } catch {
    // Ignored on purpose. That includes a workspace that was deleted mid-run: the mail still went out.
  }
}

// A chunk is at most 10 messages with ~1.5s between each; leave generous headroom.
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await requireMailbox(request, headers);
  if (!access.ok) return access.response;
  const { session, account, store } = access;
  if (!sendLimiter.check(clientKey(request))) {
    return json({ error: "Sending too fast. Wait a moment and continue." }, headers, 429);
  }

  const body = await readJson(request, sendSchema, headers);
  if (!body.ok) return body.response;

  const env = getEnv();
  const mailer = createMailer({ user: session.user, pass: session.pass, preset: session.preset });
  try {
    const result = await sendBatch({
      mailer,
      identity: {
        user: session.user,
        pass: session.pass,
        fromName: session.fromName ?? "",
        fromAddress: session.fromAddress,
        replyTo: session.replyTo,
      },
      messages: body.data.messages,
      delayMs: env.sendDelayMs,
    });
    // Re-seal to extend the idle window while a run is in progress.
    await session.save();
    if (body.data.run) {
      await recordHistory(store, account.email, session, body.data.run, body.data.messages, result.outcomes);
    }
    return json(result, headers);
  } finally {
    mailer.close();
  }
}
