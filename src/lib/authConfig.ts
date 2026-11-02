/** Throwaway secret so `next dev` works before AUTH_SECRET is set. Never used in production. */
const DEV_SECRET = "kitepost-dev-only-auth-secret-not-for-production";

const SECURE = process.env.NODE_ENV === "production";

/** Own cookie name so another Auth.js app on localhost can't collide with ours. */
export const AUTH_COOKIE_NAME = `${SECURE ? "__Secure-" : ""}kitepost.session-token`;
export const AUTH_COOKIE_SECURE = SECURE;

export function authSecret(): string | undefined {
  return process.env.AUTH_SECRET ?? (SECURE ? undefined : DEV_SECRET);
}
