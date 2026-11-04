import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/gate";

// When APP_PASSWORD is set, every page and server action needs the session cookie from /login.
export async function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Open: the login page itself, the health check, Inngest (it authenticates with its signing key), and static assets.
  matcher: ["/((?!login|api/health|api/inngest|_next/static|_next/image|favicon.ico).*)"],
};
