import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_SECURE, authSecret } from "@/lib/authConfig";
import { getStore } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  secret: authSecret(),
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: AUTH_COOKIE_NAME,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: AUTH_COOKIE_SECURE },
    },
  },
  // Sign-in lives in the landing page modal; failures come back to it too.
  pages: { signIn: "/", error: "/" },
  events: {
    // Save the account the moment it signs in, and give it a starter workspace. Best effort:
    // a database problem must never stop someone from signing in.
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return;
      try {
        const store = await getStore();
        await store?.recordUser(email, { name: user.name ?? "", ...(user.image ? { image: user.image } : {}) });
      } catch {
        // Ignored on purpose. The session route saves the account again on the next load.
      }
    },
  },
});
