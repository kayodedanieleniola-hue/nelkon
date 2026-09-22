import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Node.js request guard for protected portal areas. Pages and API routes still
// perform their own server-side authorization checks.
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const token = req.cookies.get("nak_student_session")?.value;
    const payload = await verify(token);
    if (!payload || payload.role !== "student") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // /learning/login is public. Existing CBT sessions remain accepted for
  // backwards compatibility alongside Learning Center OTP sessions.
  if (pathname.startsWith("/learning") && pathname !== "/learning/login") {
    const lcToken = req.cookies.get("nak_lc_session")?.value;
    const cbtToken = req.cookies.get("nak_student_session")?.value;
    const lcPayload = await verify(lcToken);
    const cbtPayload = await verify(cbtToken);

    const isLcAuthed = !!lcPayload?.profileId;
    const isCbtAuthed = cbtPayload?.role === "student";
    if (!isLcAuthed && !isCbtAuthed) {
      return NextResponse.redirect(new URL("/learning/login", req.url));
    }
    return NextResponse.next();
  }

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
