import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { prisma } from "@/lib/db";
import { endAttempt } from "@/lib/attemptEnd";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const now = new Date();
  const attempts = await prisma.examAttempt.findMany({
    where: { status: "IN_PROGRESS" },
    include: {
      student: { select: { studentId: true, fullName: true, email: true } },
      exam: { select: { name: true, course: { select: { name: true } } } },
    },
    orderBy: { startedAt: "asc" },
  });

  const active = attempts.filter((attempt) => attempt.expiresAt > now);
  const expired = attempts.filter((attempt) => attempt.expiresAt <= now);

  // Route every timeout through the same shared helper everything else in
  // the app uses — not a raw bulk update. That helper is what writes the
  // audit log entry, sets endedBy correctly, and is the single place
  // exam-ending logic lives. A bypass here previously meant: the instant an
  // admin loaded this page (or its 15s poll fired), any exam that had run
  // out of time got silently finalized with no record of why — which could
  // look like "opening monitoring disconnected the student" when what
  // actually happened was their timer running out at that same moment.
  for (const attempt of expired) {
    await endAttempt(attempt.id, "TIMED_OUT", "timeout");
  }

  return NextResponse.json({ attempts: active.map((attempt) => ({
    id: attempt.id,
    student: attempt.student,
    exam: attempt.exam.name,
    course: attempt.exam.course.name,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
  })) });
}
