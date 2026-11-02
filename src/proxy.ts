import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Optimistic gate: signed-out visitors never reach the workspace or the
 * mail/saved-data API. It only reads the session cookie. Auth.js's own
 * endpoints (/api/auth/*) stay public so sign-in can happen.
 */
export const proxy = auth((request) => {
  if (request.auth) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to use Kitepost.", code: "signed-out" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/?signin=1", request.nextUrl));
});

export const config = {
  matcher: ["/app/:path*", "/api/((?!auth(?:/|$)).*)"],
};
