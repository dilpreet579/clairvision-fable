import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "cv_session";

// The session cookie's Domain is the API's host, not this app's — when
// the frontend and API are deployed on different hosts (e.g. Vercel +
// a standalone API domain), the edge runtime here never sees it even
// for a logged-in organizer. Only run the cookie-presence fast path
// when the two are same-host; otherwise defer entirely to the
// authoritative check below.
const API_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").hostname || null;
  } catch {
    return null;
  }
})();

// Fast-path UX only: bounce to /login when the session cookie is merely
// ABSENT. It cannot validate the session (no DB at the edge) — the
// dashboard layout's /auth/me call is the authoritative check.
export function middleware(request: NextRequest) {
  const sameHostAsApi = API_HOST === null || API_HOST === request.nextUrl.hostname;
  if (sameHostAsApi && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard"],
};
