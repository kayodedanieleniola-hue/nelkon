import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge-safe first line of defense: confirms a valid session cookie exists
// AND carries the right role for the area being accessed. Every page and
// API route still re-checks server-side — this just stops obviously-
// unauthenticated requests before they render.

async function verify(token: string | undefined) {
  if (!token) return null;
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("missing secret");
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── CBT exam student dashboard ─────────────────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    const token = req.cookies.get("nak_student_session")?.value;
    const payload = await verify(token);
    if (!payload || payload.role !== "student") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Learning Center — external students via OTP login ─────────────────
  // /learning/login is public — everything else requires nak_lc_session
  if (pathname.startsWith("/learning") && pathname !== "/learning/login") {
    // Also allow the old CBT student session for backward-compat
    const lcToken  = req.cookies.get("nak_lc_session")?.value;
    const cbtToken = req.cookies.get("nak_student_session")?.value;

    const lcPayload  = await verify(lcToken);
    const cbtPayload = await verify(cbtToken);

    const isLcAuthed  = !!lcPayload?.profileId;    // new external OTP session
    const isCbtAuthed = cbtPayload?.role === "student"; // existing CBT student

    if (!isLcAuthed && !isCbtAuthed) {
      return NextResponse.redirect(new URL("/learning/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Admin dashboard ────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get("nak_admin_session")?.value;
    const payload = await verify(token);
    if (!payload || payload.role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/learning/:path*", "/admin/:path*"],
};
