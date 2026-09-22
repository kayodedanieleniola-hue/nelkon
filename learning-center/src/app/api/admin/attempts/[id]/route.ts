import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

// Deletes an exam attempt (and its answer rows, via cascade) so the student
// can start a fresh one. Used for legitimate retakes — technical issues,
// a mistaken early submission, etc. Always logged, never silent.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const attempt = await prisma.examAttempt.findUnique({
    where: { id },
    include: { student: { select: { studentId: true, fullName: true } }, exam: { select: { name: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  await prisma.examAttempt.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.reset_exam_attempt",
      detail: `${attempt.student.studentId} (${attempt.student.fullName}) — ${attempt.exam.name}`,
    },
  });

  return NextResponse.json({ ok: true });
}
