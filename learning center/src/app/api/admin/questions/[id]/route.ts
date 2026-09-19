import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

function validateOptions(options: unknown, correctIndex: unknown): string | null {
  if (!Array.isArray(options) || options.length < 2) {
    return "Provide at least 2 answer options";
  }
  if (options.some((o) => typeof o !== "string" || !o.trim())) {
    return "Every answer option must have text";
  }
  const idx = Number(correctIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
    return "Pick which option is correct";
  }
  return null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as {
    courseId?: string;
    examId?: string;
    text?: string;
    options?: string[];
    correctIndex?: number;
    active?: boolean;
  };

  if (b.examId !== undefined) {
    const exam = await prisma.exam.findFirst({ where: { id: b.examId, courseId: b.courseId ?? existing.courseId } });
    if (!exam) return NextResponse.json({ error: "Test not found for this course" }, { status: 400 });
  }

  const data: {
    courseId?: string;
    examId?: string;
    text?: string;
    options?: string[];
    correctIndex?: number;
    active?: boolean;
  } = {};

  if (b.courseId !== undefined) data.courseId = b.courseId;
  if (b.examId !== undefined) data.examId = b.examId;

  if (b.text !== undefined) {
    if (!b.text.trim()) {
      return NextResponse.json({ error: "Question text is required" }, { status: 400 });
    }
    data.text = b.text.trim();
  }

  if (b.options !== undefined || b.correctIndex !== undefined) {
    const options = b.options ?? existing.options;
    const correctIndex = b.correctIndex ?? existing.correctIndex;
    const optionsError = validateOptions(options, correctIndex);
    if (optionsError) {
      return NextResponse.json({ error: optionsError }, { status: 400 });
    }
    data.options = options.map((o) => o.trim());
    data.correctIndex = Number(correctIndex);
  }

  if (b.active !== undefined) {
    data.active = !!b.active;
  }

  const question = await prisma.question.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.update_question",
      detail: question.text.slice(0, 80),
    },
  });

  return NextResponse.json({ question });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  await prisma.question.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.delete_question",
      detail: existing.text.slice(0, 80),
    },
  });

  return NextResponse.json({ ok: true });
}
