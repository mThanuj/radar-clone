import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Cheap gate only. This runs on the edge, where there is no database and no
 * Node crypto, so it cannot validate a session — it just checks the cookie is
 * present and bounces obvious anonymous traffic. Real authorization is
 * requireUser() in the app layout and in every server action.
 */
export function middleware(request: NextRequest) {
  const hasSession = getSessionCookie(request);
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  if (!hasSession && !isAuthPage) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
