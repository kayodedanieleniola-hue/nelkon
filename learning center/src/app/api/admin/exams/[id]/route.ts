import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { getExamStatus } from "@/lib/examStatus";
import { getPublishValidation } from "@/lib/examValidation";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: { course: { select: { id: true, name: true } } },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  const validation = await getPublishValidation(exam);

  return NextResponse.json({
    exam: { ...exam, status: getExamStatus(exam, new Date()) },
    validation,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = await prisma.exam.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  const b = body as {
    name?: string;
    order?: number;
    numQuestions?: number;
    durationMinutes?: number;
    passingScore?: number;
    instructions?: string | null;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    startAt?: string | null;
    endAt?: string | null;
    action?: "publish" | "unpublish";
  };

  // Publishing is its own guarded action, not just flipping a boolean —
  // it must pass the full checklist every time, matching the spec.
  if (b.action === "publish") {
    const merged = {
      id,
      numQuestions: b.numQuestions ?? existing.numQuestions,
      durationMinutes: b.durationMinutes ?? existing.durationMinutes,
      passingScore: b.passingScore ?? existing.passingScore,
      startAt: b.startAt !== undefined ? (b.startAt ? new Date(b.startAt) : null) : existing.startAt,
      endAt: b.endAt !== undefined ? (b.endAt ? new Date(b.endAt) : null) : existing.endAt,
      courseId: existing.courseId,
    };

    const validation = await getPublishValidation(merged);
    if (!validation.canPublish) {
      return NextResponse.json(
        { error: "Cannot publish exam — validation failed", validation },
        { status: 422 }
      );
    }

    const exam = await prisma.exam.update({
      where: { id },
      data: { published: true, startAt: merged.startAt, endAt: merged.endAt },
    });

    await prisma.auditLog.create({
      data: { actorType: "admin", actorId: guard.session.sub, action: "admin.publish_exam", detail: exam.name },
    });

    return NextResponse.json({ exam, validation });
  }

  if (b.action === "unpublish") {
    const exam = await prisma.exam.update({ where: { id }, data: { published: false } });
    await prisma.auditLog.create({
      data: { actorType: "admin", actorId: guard.session.sub, action: "admin.unpublish_exam", detail: exam.name },
    });
    return NextResponse.json({ exam });
  }

  // Plain field update (not a publish action). Editing a currently-published
  // exam is allowed but un-publishes it — a schedule or question-count
  // change must be re-validated before it can go live again.
  const data: Record<string, unknown> = {};
  if (b.name !== undefined) data.name = b.name.trim();
  if (b.order !== undefined) data.order = Number(b.order);
  if (b.numQuestions !== undefined) data.numQuestions = Math.max(1, Number(b.numQuestions));
  if (b.durationMinutes !== undefined) data.durationMinutes = Math.max(1, Number(b.durationMinutes));
  if (b.passingScore !== undefined) data.passingScore = Math.min(100, Math.max(0, Number(b.passingScore)));
  if (b.instructions !== undefined) data.instructions = b.instructions?.trim() || null;
  if (b.shuffleQuestions !== undefined) data.shuffleQuestions = b.shuffleQuestions;
  if (b.shuffleOptions !== undefined) data.shuffleOptions = b.shuffleOptions;
  if (b.startAt !== undefined) data.startAt = b.startAt ? new Date(b.startAt) : null;
  if (b.endAt !== undefined) data.endAt = b.endAt ? new Date(b.endAt) : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (existing.published) {
    data.published = false;
  }

  const exam = await prisma.exam.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.update_exam",
      detail: exam.name,
    },
  });

  return NextResponse.json({ exam });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const exam = await prisma.exam.findUnique({ where: { id } });
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  await prisma.exam.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { actorType: "admin", actorId: guard.session.sub, action: "admin.delete_exam", detail: exam.name },
  });

  return NextResponse.json({ ok: true });
}
