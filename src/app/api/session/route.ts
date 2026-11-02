import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { currentAccount, type Account } from "@/lib/account";
import { sealSecret } from "@/lib/crypto";
import { getStoreOrNull, type Store } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { json, noStoreHeaders, readJson } from "@/lib/http";
import { mapMailError } from "@/lib/mail/errors";
import { quotaHint } from "@/lib/mail/providers";
import { redactSecrets } from "@/lib/mail/redact";
import { createMailer } from "@/lib/mail/transport";
import { connectLimiter } from "@/lib/limiters";
import { clientKey } from "@/lib/rateLimit";
import { resolveSession } from "@/lib/session/connection";
import { openSession, SESSION_TTL_SECONDS, toProfile, type SessionData } from "@/lib/session/seal";
import { connectSchema } from "@/lib/validation/schemas";

const bodySchema = z.union([
  connectSchema,
  z.object({ local: z.literal(true), accessCode: z.string().max(200).optional() }),
]);

function accessCodeMatches(expected: string, given: string | undefined): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function statusBody(session: SessionData, account: Account) {
  return {
    savingAvailable: Boolean(getEnv().mongoUri),
    connected: true as const,
    account: account.email,
    profile: toProfile(session),
    quota: quotaHint(session.user),
    expiresInSeconds: SESSION_TTL_SECONDS,
  };
}

/** Make sure the signed-in account has a user record (and so a starter workspace). Best effort. */
async function ensureUser(store: Store | null, account: Account): Promise<void> {
  if (!store) return;
  try {
    if (!(await store.getUser(account.email))) {
      await store.recordUser(account.email, { name: account.name, ...(account.image ? { image: account.image } : {}) });
    }
  } catch {
    // Ignored on purpose: a database problem must never block the page.
  }
}

export async function GET(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const env = getEnv();
  const base = {
    accessCodeRequired: Boolean(env.accessCode),
    localAccountAvailable: Boolean(env.localAccount),
    maxRecipientsPerRun: env.maxRecipientsPerRun,
    savingAvailable: Boolean(env.mongoUri),
  };
  const account = await currentAccount(request);
  if (!account) return json({ connected: false, ...base }, headers);

  const store = await getStoreOrNull();
  await ensureUser(store, account);
  const session = await resolveSession(request, headers, account, store);
  if (!session) return json({ connected: false, account: account.email, ...base }, headers);
  return json({ ...statusBody(session, account), ...base }, headers);
}

export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const env = getEnv();

  if (!connectLimiter.check(clientKey(request))) {
    return json({ error: "Too many connection attempts. Wait a few minutes and try again." }, headers, 429);
  }

  const account = await currentAccount(request);
  if (!account) return json({ error: "Sign in to use Kitepost.", code: "signed-out" }, headers, 401);

  const body = await readJson(request, bodySchema, headers);
  if (!body.ok) return body.response;

  if (env.accessCode && !accessCodeMatches(env.accessCode, body.data.accessCode)) {
    return json({ error: "That access code is not right." }, headers, 403);
  }

  let data: SessionData;
  if ("local" in body.data) {
    if (!env.localAccount) {
      return json({ error: "No local default account is configured." }, headers, 400);
    }
    const l = env.localAccount;
    data = { user: l.user, pass: l.pass, fromName: l.fromName, fromAddress: l.fromAddress, replyTo: l.replyTo, preset: "gmail" };
  } else {
    const c = body.data;
    data = {
      user: c.user,
      pass: c.password,
      fromName: c.fromName,
      fromAddress: c.fromAddress ?? c.user,
      replyTo: c.replyTo ?? c.fromAddress ?? c.user,
      preset: c.preset as SessionData["preset"],
    };
  }

  const mailer = createMailer({ user: data.user, pass: data.pass, preset: data.preset });
  try {
    await mailer.verify();
  } catch (error) {
    const mapped = mapMailError(error);
    return json({ error: redactSecrets(mapped.message, [data.pass]), code: mapped.code }, headers, 401);
  } finally {
    mailer.close();
  }

  const session = await openSession(request, headers);
  Object.assign(session, data, { account: account.email });
  await session.save();

  // Save the account and its connection so they outlive the cookie and work on any device. The
  // app password is stored encrypted, bound to this account. Best effort: a database problem
  // must never stop someone from connecting.
  try {
    const store = await getStoreOrNull();
    if (store) {
      await store.recordUser(account.email, { name: account.name, ...(account.image ? { image: account.image } : {}) });
      await store.saveConnection(account.email, {
        user: data.user,
        secret: sealSecret(data.pass, env.sessionSecret, account.email),
        preset: data.preset,
        fromName: data.fromName,
        fromAddress: data.fromAddress,
        replyTo: data.replyTo,
      });
      await store.saveSender(account.email, {
        fromName: data.fromName,
        fromAddress: data.fromAddress,
        replyTo: data.replyTo,
      });
    }
  } catch (error) {
    // Never blocks connecting, but leave the cause in the server logs. Name and message only.
    console.error(`[storage] saving the connection failed: ${error instanceof Error ? `${error.name}: ${error.message}` : "unknown error"}`);
  }
  return json(statusBody(data, account), headers);
}

/** Disconnect the mailbox: forget it here and in the database. The account and its workspaces stay. */
export async function DELETE(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const session = await openSession(request, headers);
  session.destroy();
  const account = await currentAccount(request);
  const accountEmail = account?.email;
  if (accountEmail) {
    try {
      await (await getStoreOrNull())?.deleteConnection(accountEmail);
    } catch {
      // Ignored on purpose. The cookie is already gone, so this device is disconnected either way.
    }
  }
  return json({ connected: false, ...(accountEmail ? { account: accountEmail } : {}) }, headers);
}
