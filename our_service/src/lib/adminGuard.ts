import { NextResponse } from "next/server";
import { getAdminSession, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Verifies the request is from a logged-in, active admin. Never trust the
 * client's claimed role — this re-checks the signed session AND the admin's
 * current status in the database on every call, so a disabled admin loses
 * access immediately rather than whenever their token happens to expire.
 */
export async function requireAdmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; response: NextResponse }
> {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = await prisma.admin.findUnique({ where: { id: session.sub } });
  if (!admin || admin.status !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true, session };
}
