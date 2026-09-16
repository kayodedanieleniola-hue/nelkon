/**
 * GET /api/learning/general
 *
 * Returns all General Meeting classes that are currently LIVE or SCHEDULED.
 * Accessible to any authenticated student — no course enrollment required.
 */
import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getStudentSession();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // Any active student can see general meetings
  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { status: true },
  });
  if (!student || student.status !== "active") {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const meetings = await prisma.learningClass.findMany({
    where: {
      isGeneral: true,
      status: { in: ["LIVE", "SCHEDULED"] },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      instructor: true,
      description: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });

  return NextResponse.json({ meetings });
}
