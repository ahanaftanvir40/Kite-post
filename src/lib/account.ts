import { getToken } from "next-auth/jwt";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE, authSecret } from "@/lib/authConfig";

/** The Google account that is signed in. `email` is lower-cased and is the key all saved data hangs off. */
export interface Account {
  email: string;
  name: string;
  image?: string;
}

/**
 * Who is signed in, read from the Auth.js cookie on this request. Null when nobody is,
 * or the cookie cannot be read. Never throws.
 */
export async function currentAccount(request: Request): Promise<Account | null> {
  try {
    const token = await getToken({
      req: request,
      secret: authSecret(),
      cookieName: AUTH_COOKIE_NAME,
      secureCookie: AUTH_COOKIE_SECURE,
    });
    const email = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
    if (!email) return null;
    return {
      email,
      name: typeof token?.name === "string" ? token.name : "",
      ...(typeof token?.picture === "string" && token.picture ? { image: token.picture } : {}),
    };
  } catch {
    return null;
  }
}
