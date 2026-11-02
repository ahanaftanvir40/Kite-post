import { encode } from "next-auth/jwt";
import { vi } from "vitest";
import { AUTH_COOKIE_NAME, authSecret } from "@/lib/authConfig";
import type { Mailer, OutgoingMail } from "@/lib/mail/transport";

export interface FakeMailer extends Mailer {
  sent: OutgoingMail[];
}

export interface FakeMailerOptions {
  verify?: () => Promise<unknown>;
  send?: (message: OutgoingMail, index: number) => Promise<unknown>;
}

export function makeFakeMailer(options: FakeMailerOptions = {}): FakeMailer {
  const sent: OutgoingMail[] = [];
  return {
    sent,
    verify: vi.fn(options.verify ?? (async () => true)),
    sendMail: vi.fn(async (message: OutgoingMail) => {
      const index = sent.length;
      sent.push(message);
      return options.send ? options.send(message, index) : {};
    }),
    close: vi.fn(),
  };
}

export function jsonRequest(url: string, method: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Turn a response's Set-Cookie into a Cookie request header value. */
export function cookieFrom(response: Response): string | undefined {
  const raw = response.headers.getSetCookie?.() ?? [];
  const parts = raw.map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c));
  return parts.length ? parts.join("; ") : undefined;
}

/** A real Auth.js session cookie for a signed-in Google account. */
export async function authCookie(email: string, name = "Test User"): Promise<string> {
  const token = await encode({ token: { email, name, picture: "https://example.com/p.png" }, secret: authSecret()!, salt: AUTH_COOKIE_NAME });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

/** Join cookie header values, skipping the empty ones. */
export function joinCookies(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join("; ");
}
