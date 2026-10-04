import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // /api/incoming/upload is excluded because proxy buffers the entire
  // request body in memory (capped by proxyClientMaxBodySize) to allow
  // both proxy and the route handler to read it, which caps how large a
  // photo zip upload can be. That route checks auth itself instead.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/incoming/upload).*)",
  ],
};
