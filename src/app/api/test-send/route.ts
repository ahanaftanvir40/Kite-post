import { json, noStoreHeaders, readJson } from "@/lib/http";
import { sendBatch } from "@/lib/mail/send";
import { createMailer } from "@/lib/mail/transport";
import { testSendLimiter } from "@/lib/limiters";
import { clientKey } from "@/lib/rateLimit";
import { requireMailbox } from "@/lib/session/connection";
import { testSendSchema } from "@/lib/validation/schemas";

/** Sends one message from the chosen From alias to the connected account itself. */
export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await requireMailbox(request, headers);
  if (!access.ok) return access.response;
  const { session } = access;
  if (!testSendLimiter.check(clientKey(request))) {
    return json({ error: "Too many test emails. Wait a few minutes." }, headers, 429);
  }

  const body = await readJson(request, testSendSchema, headers);
  if (!body.ok) return body.response;

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
      messages: [{ rowId: "test", to: session.user, subject: `[Test] ${body.data.subject}`, html: body.data.html }],
      delayMs: 0,
    });
    const outcome = result.outcomes[0];
    if (outcome.status !== "sent") {
      return json({ error: outcome.status === "failed" ? outcome.error : "Test was not sent." }, headers, 502);
    }
    return json({ sentTo: session.user, from: session.fromAddress, replyTo: session.replyTo }, headers);
  } finally {
    mailer.close();
  }
}
