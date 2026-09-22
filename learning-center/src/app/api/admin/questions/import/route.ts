import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body as { courseId?: string; examId?: string; rows?: unknown };
  if (!input.courseId || !input.examId || !Array.isArray(input.rows) || input.rows.length === 0) {
    return NextResponse.json({ error: "Course, test, and at least one question are required" }, { status: 400 });
  }

  const exam = await prisma.exam.findFirst({ where: { id: input.examId, courseId: input.courseId } });
  if (!exam) return NextResponse.json({ error: "Test not found for this course" }, { status: 400 });

  const questions: Array<{ text: string; options: string[]; correctIndex: number }> = [];
  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex += 1) {
    const row = input.rows[rowIndex] as { text?: unknown; options?: unknown; correctIndex?: unknown };
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const options = Array.isArray(row.options) ? row.options.map((option) => typeof option === "string" ? option.trim() : "") : [];
    const correctIndex = Number(row.correctIndex);
    if (!text || options.length < 2 || options.some((option) => !option) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      const reason = !text ? "missing question text" : options.length < 2 ? "at least 2 options are required" : options.some((option) => !option) ? "an option is blank" : "the correct answer must be 1, 2, 3, or 4";
      return NextResponse.json({ error: `Invalid question data on row ${rowIndex + 1}: ${reason}` }, { status: 422 });
    }
    questions.push({ text, options, correctIndex });
  }

  const created = await prisma.$transaction(
    questions.map((question) => prisma.question.create({
      data: { courseId: input.courseId!, examId: input.examId!, ...question },
    }))
  );

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.import_questions",
      detail: `${created.length} questions imported for ${exam.name}`,
    },
  });

  return NextResponse.json({ imported: created.length }, { status: 201 });
}
