import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const attempts = await prisma.examAttempt.findMany({
    where: { status: { in: ["SUBMITTED", "TIMED_OUT", "TERMINATED"] } },
    include: {
      student: { select: { studentId: true, fullName: true, email: true } },
      exam: { select: { name: true, passingScore: true, course: { select: { name: true } } } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return NextResponse.json({ results: attempts.map((attempt) => ({
    id: attempt.id,
    student: attempt.student,
    course: attempt.exam.course.name,
    exam: attempt.exam.name,
    score: attempt.score ?? 0,
    passingScore: attempt.exam.passingScore,
    passed: attempt.passed === true,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
  })) });
}
