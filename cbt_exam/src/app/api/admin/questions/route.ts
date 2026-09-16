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

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? "";
  const examId = url.searchParams.get("examId") ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";

  const questions = await prisma.question.findMany({
    where: {
      ...(courseId ? { courseId } : {}),
      ...(examId ? { examId } : {}),
      ...(search ? { text: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ courseId: "asc" }, { createdAt: "desc" }],
    include: {
      course: { select: { id: true, name: true } },
      exam: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

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

  if (!b.courseId || !b.examId || !b.text?.trim()) {
    return NextResponse.json({ error: "Course, test, and question text are required" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: b.courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 400 });
  }

  const exam = await prisma.exam.findFirst({ where: { id: b.examId, courseId: b.courseId } });
  if (!exam) {
    return NextResponse.json({ error: "Test not found for this course" }, { status: 400 });
  }

  const optionsError = validateOptions(b.options, b.correctIndex);
  if (optionsError) {
    return NextResponse.json({ error: optionsError }, { status: 400 });
  }

  const options = (b.options as string[]).map((o) => o.trim());

  const question = await prisma.question.create({
    data: {
      courseId: b.courseId,
      examId: b.examId,
      text: b.text.trim(),
      options,
      correctIndex: Number(b.correctIndex),
      active: b.active ?? true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.create_question",
      detail: `${course.name} / ${exam.name}: ${question.text.slice(0, 80)}`,
    },
  });

  return NextResponse.json({ question });
}
