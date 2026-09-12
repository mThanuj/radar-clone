import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Cheap gate only. This runs on the edge, where there is no database and no
 * Node crypto, so it cannot validate a session — it only checks the cookie is
 * present and bounces obvious anonymous traffic. Real authorization is
 * requireUser() in the app layout and in every server action.
 *
 * It deliberately does NOT redirect people away from the sign-in page when a
 * cookie is present. Doing that caused an infinite loop: a stale or
 * unverifiable cookie (a rotated BETTER_AUTH_SECRET, an expired session) looks
 * valid here but is rejected by requireUser(), so "/" bounced to /sign-in and
 * middleware bounced it straight back. Presence and validity are different
 * questions, and only one of them can be answered here — so the "already
 * signed in, go home" redirect lives in the (auth) layout, where the session
 * is actually verified.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  if (isAuthPage) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
