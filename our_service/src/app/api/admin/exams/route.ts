import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { getExamStatus } from "@/lib/examStatus";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? "";

  const exams = await prisma.exam.findMany({
    where: courseId ? { courseId } : {},
    orderBy: [{ courseId: "asc" }, { order: "asc" }],
    include: { course: { select: { id: true, name: true } } },
  });

  const now = new Date();
  return NextResponse.json({
    exams: exams.map((e) => ({ ...e, status: getExamStatus(e, now) })),
  });
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
    name?: string;
    order?: number;
    numQuestions?: number;
    durationMinutes?: number;
    passingScore?: number;
    instructions?: string;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
  };

  if (!b.courseId || !b.name?.trim()) {
    return NextResponse.json({ error: "Course and exam name are required" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: b.courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 400 });
  }

  const exam = await prisma.exam.create({
    data: {
      courseId: b.courseId,
      name: b.name.trim(),
      order: Number.isFinite(b.order) ? Number(b.order) : 0,
      numQuestions: Math.max(1, Number(b.numQuestions) || 1),
      durationMinutes: Math.max(1, Number(b.durationMinutes) || 30),
      passingScore: Math.min(100, Math.max(0, Number(b.passingScore) || 50)),
      instructions: b.instructions?.trim() || null,
      shuffleQuestions: b.shuffleQuestions ?? true,
      shuffleOptions: b.shuffleOptions ?? true,
      // Always created unpublished with no schedule — admin sets those
      // explicitly and publishes as a separate, validated step.
      published: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.create_exam",
      detail: `${exam.name} for ${course.name}`,
    },
  });

  return NextResponse.json({ exam });
}
