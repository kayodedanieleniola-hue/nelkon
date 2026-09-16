import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getExamStatus } from "@/lib/examStatus";
import { endAttempt } from "@/lib/attemptEnd";

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

const SESSION_STALE_MS = 45_000; // matches the client's ~20s heartbeat with room for one missed beat

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession();
  if (!session || session.role !== "student") {
    return NextResponse.json({ error: "You must be logged in as a student" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const sessionId = typeof (body as { sessionId?: unknown }).sessionId === "string"
    ? (body as { sessionId: string }).sessionId
    : null;
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session identifier" }, { status: 400 });
  }

  const { id: examId } = await params;
  const student = await prisma.student.findUnique({ where: { id: session.sub } });
  if (!student || student.status !== "active") {
    return NextResponse.json({ error: "Student account is not active" }, { status: 403 });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam || exam.courseId !== student.courseId) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }

  if (getExamStatus(exam, new Date()) !== "ONGOING") {
    return NextResponse.json({ error: "This exam is not currently available" }, { status: 422 });
  }

  const existing = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: student.id } },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  // A row already exists and is finalized (or just now discovered to be
  // expired) — none of these should ever fall through to creating a new
  // attempt row, since (examId, studentId) is a unique pair in the
  // database. Trying to create a second row for the same pair after a
  // timeout was exactly the bug: it collided with the very row it just
  // finalized.
  if (existing?.status === "SUBMITTED" || existing?.status === "TERMINATED") {
    return NextResponse.json({ error: "You have already submitted this exam" }, { status: 409 });
  }
  if (existing?.status === "TIMED_OUT") {
    return NextResponse.json({ error: "This exam's time expired. It cannot be restarted." }, { status: 409 });
  }
  if (existing && existing.status === "IN_PROGRESS" && existing.expiresAt <= new Date()) {
    // Time ran out and nothing had touched this attempt yet to record
    // that — finalize it now, then block, same as an already-known timeout.
    await endAttempt(existing.id, "TIMED_OUT", "timeout");
    return NextResponse.json({ error: "This exam's time expired. It cannot be restarted." }, { status: 409 });
  }

  if (existing && existing.expiresAt > new Date()) {
    const otherSessionActive =
      existing.activeSessionId &&
      existing.activeSessionId !== sessionId &&
      existing.activeSessionAt &&
      Date.now() - existing.activeSessionAt.getTime() < SESSION_STALE_MS;

    if (otherSessionActive) {
      await prisma.auditLog.create({
        data: {
          actorType: "student",
          actorId: student.id,
          attemptId: existing.id,
          action: "student.duplicate_session",
          detail: exam.name,
        },
      });
      return NextResponse.json(
        { error: "This exam is already open in another window or device." },
        { status: 409 }
      );
    }

    const resumed = await prisma.examAttempt.update({
      where: { id: existing.id },
      data: { activeSessionId: sessionId, activeSessionAt: new Date() },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json({ attempt: serializeAttempt(resumed) });
  }

  const questionPool = await prisma.question.findMany({
    where: { courseId: exam.courseId, examId, active: true },
    select: { id: true, text: true, options: true, correctIndex: true },
  });

  if (questionPool.length < exam.numQuestions) {
    return NextResponse.json({ error: "This exam does not have enough active questions" }, { status: 422 });
  }

  const selectedQuestions = shuffle(questionPool).slice(0, exam.numQuestions);
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + exam.durationMinutes * 60 * 1000);

  const attempt = await prisma.examAttempt.create({
    data: {
      examId,
      studentId: student.id,
      startedAt,
      expiresAt,
      activeSessionId: sessionId,
      activeSessionAt: startedAt,
      questions: {
        create: selectedQuestions.map((question, position) => {
          const optionEntries = question.options.map((text, index) => ({ text, index }));
          const orderedOptions = exam.shuffleOptions ? shuffle(optionEntries) : optionEntries;
          return {
            questionId: question.id,
            position,
            text: question.text,
            options: orderedOptions.map((option) => option.text),
            correctIndex: orderedOptions.findIndex((option) => option.index === question.correctIndex),
          };
        }),
      },
    },
    include: { questions: { orderBy: { position: "asc" } } },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "student",
      actorId: student.id,
      action: "student.start_exam",
      detail: exam.name,
    },
  });

  return NextResponse.json({ attempt: serializeAttempt(attempt) }, { status: 201 });
}

function serializeAttempt(attempt: {
  id: string;
  examId: string;
  status: string;
  startedAt: Date;
  expiresAt: Date;
  questions: Array<{ id: string; position: number; text: string; options: string[]; selectedIndex: number | null }>;
}) {
  return {
    id: attempt.id,
    examId: attempt.examId,
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    questions: attempt.questions.map(({ id, position, text, options, selectedIndex }) => ({
      id,
      position,
      text,
      options,
      selectedIndex,
    })),
  };
}
