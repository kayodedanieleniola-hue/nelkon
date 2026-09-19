import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const attempt = await prisma.examAttempt.findUnique({
    where: { id },
    include: {
      student: { select: { studentId: true, fullName: true, email: true } },
      exam: { select: { name: true, passingScore: true, course: { select: { name: true } } } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const events = await prisma.auditLog.findMany({
    where: { attemptId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      student: attempt.student,
      course: attempt.exam.course.name,
      exam: attempt.exam.name,
      passingScore: attempt.exam.passingScore,
      score: attempt.score,
      passed: attempt.passed,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      endedBy: attempt.endedBy,
      endReason: attempt.endReason,
      questions: attempt.questions.map((q) => ({
        id: q.id,
        position: q.position,
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        selectedIndex: q.selectedIndex,
      })),
    },
    events,
  });
}
