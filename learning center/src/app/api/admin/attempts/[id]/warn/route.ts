import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

// Delivered on the student's next heartbeat (within ~20s), then cleared —
// read-once, so it's shown exactly once rather than repeating every beat.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const message = (body as { message?: string }).message?.trim();
  if (!message) return NextResponse.json({ error: "A warning message is required" }, { status: 400 });

  const attempt = await prisma.examAttempt.findUnique({
    where: { id },
    include: { exam: { select: { name: true } }, student: { select: { studentId: true, fullName: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This exam is not currently in progress" }, { status: 409 });
  }

  await prisma.examAttempt.update({ where: { id }, data: { pendingWarning: message } });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      attemptId: id,
      action: "admin.warn_student",
      detail: `${attempt.student.studentId} (${attempt.student.fullName}) — ${attempt.exam.name}: "${message}"`,
    },
  });

  return NextResponse.json({ ok: true });
}
