import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Minimal shared-password gate. Not real auth - just enough to keep this prototype
// from being wide open when deployed. See architecture.md "Auth" decision: this is
// intentionally not the focus of the prototype.
//
// If APP_PASSWORD is unset, auth is disabled entirely (useful for local dev).

const COOKIE_NAME = "pe_monitor_auth";

export function proxy(request: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === appPassword) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
