import { NextResponse, NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Migration Note (Next.js 16+):
 * The 'middleware' convention has been renamed to 'proxy' to better reflect
 * its role as a network-level boundary for request interception.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const { pathname } = request.nextUrl;

  // 1. Allow access to auth APIs and login page
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next();
  }

  // 2. If no token, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    // 3. Verify JWT
    const secret = new TextEncoder().encode(process.env.DASHBOARD_PASSWORD);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    // 4. Invalid token, clear it and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("auth_token");
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication endpoints)
     * - login (login page)
     * - static (static files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
