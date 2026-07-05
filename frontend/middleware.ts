import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "cv_session";

// Fast-path UX only: bounce to /login when the session cookie is merely
// ABSENT. It cannot validate the session (no DB at the edge) — the
// dashboard layout's /auth/me call is the authoritative check.
export function middleware(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard"],
};
