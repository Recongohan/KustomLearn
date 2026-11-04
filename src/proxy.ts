import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";

// Open without a session: the login page, the health check, Inngest (it authenticates with its signing key), the favicon.
// Matched on whole path segments, so a future /login-admin or /api/healthz is gated.
const OPEN = /^\/(?:login|api\/health|api\/inngest|favicon\.ico)(?:\/|$)/;

// When APP_PASSWORD is set, every page and server action needs a valid session cookie from /login.
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || OPEN.test(request.nextUrl.pathname)) return NextResponse.next();

  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value ?? "", password)) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Framework assets never need the gate.
  matcher: ["/((?!_next/static/|_next/image).*)"],
};
