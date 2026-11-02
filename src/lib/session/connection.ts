import type { IronSession } from "iron-session";
import { currentAccount, type Account } from "@/lib/account";
import { openSecret } from "@/lib/crypto";
import { getStoreOrNull, type Store } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { json } from "@/lib/http";
import { hasCredentials, openSession, type SessionData } from "./seal";

export type MailboxSession = IronSession<SessionData> & SessionData;

/**
 * The mailbox this signed-in account has connected, or null. The sealed cookie is tried first;
 * when it has expired (or belongs to another account) the saved connection is decrypted and the
 * cookie is re-issued, so a person who comes back tomorrow is still connected.
 */
export async function resolveSession(request: Request, headers: Headers, account: Account, store: Store | null): Promise<MailboxSession | null> {
  const session = await openSession(request, headers);
  if (hasCredentials(session) && session.account === account.email) return session;
  // Whatever is in the cookie was connected under somebody else, or under nobody. It is not ours to use.
  if (session.user || session.pass) session.destroy();

  if (!store) return null;
  let saved;
  try {
    saved = await store.getConnection(account.email);
  } catch {
    return null;
  }
  if (!saved) return null;
  const pass = openSecret(saved.secret, getEnv().sessionSecret, account.email);
  if (!pass) return null;

  session.user = saved.user;
  session.pass = pass;
  session.fromName = saved.fromName;
  session.fromAddress = saved.fromAddress;
  session.replyTo = saved.replyTo;
  session.preset = saved.preset;
  session.account = account.email;
  await session.save();
  return hasCredentials(session) ? (session as MailboxSession) : null;
}

export type MailboxAccess =
  | { ok: true; account: Account; store: Store | null; session: MailboxSession }
  | { ok: false; response: Response };

/** For routes that act through the mailbox (sending): signed in, and a mailbox connected. */
export async function requireMailbox(request: Request, headers: Headers): Promise<MailboxAccess> {
  const account = await currentAccount(request);
  if (!account) return { ok: false, response: json({ error: "Sign in to use Kitepost.", code: "signed-out" }, headers, 401) };
  const store = await getStoreOrNull();
  const session = await resolveSession(request, headers, account, store);
  if (!session) {
    return { ok: false, response: json({ error: "Not connected. Connect your mailbox first.", code: "no-session" }, headers, 401) };
  }
  return { ok: true, account, store, session };
}
