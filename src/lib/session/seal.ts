import { getIronSession, webCookies, type IronSession, type SessionOptions } from "iron-session";
import { getEnv } from "@/lib/env";
import type { ProviderId } from "@/lib/mail/providers";

/** Everything a request needs to send mail. Lives only in the sealed cookie. */
export interface SessionData {
  user: string;
  pass: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  preset: ProviderId;
  /** The Google account this mailbox was connected under. Another account never inherits it. */
  account?: string;
}

export const SESSION_COOKIE = "postie_session";
export const SESSION_TTL_SECONDS = 2 * 60 * 60;

export function sessionOptions(): SessionOptions {
  const env = getEnv();
  return {
    cookieName: SESSION_COOKIE,
    password: env.sessionSecret,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
    },
  };
}

/** Open the session for a web `Request`; Set-Cookie is appended to `headers`. */
export function openSession(request: Request, headers: Headers): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(webCookies(request, headers), sessionOptions());
}

export function hasCredentials(session: Partial<SessionData>): session is SessionData {
  return Boolean(session.user && session.pass && session.fromAddress && session.replyTo && session.preset);
}

/** Non-secret view of a session, safe to return to the browser. */
export interface PublicProfile {
  user: string;
  fromName: string;
  fromAddress: string;
  replyTo: string;
  preset: ProviderId;
}

export function toProfile(session: SessionData): PublicProfile {
  return {
    user: session.user,
    fromName: session.fromName,
    fromAddress: session.fromAddress,
    replyTo: session.replyTo,
    preset: session.preset,
  };
}
