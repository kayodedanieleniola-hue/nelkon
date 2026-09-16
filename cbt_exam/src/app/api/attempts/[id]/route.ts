import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { endAttempt } from "@/lib/attemptEnd";

async function getStudentAttempt(params: Promise<{ id: string }>) {
  const session = await getStudentSession();
  if (!session || session.role !== "student") return { ok: false as const, reason: "unauthenticated" as const };
  const { id } = await params;

  const attempt = await prisma.examAttempt.findFirst({
    where: { id, studentId: session.sub },
    include: {
      exam: { select: { name: true, passingScore: true } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!attempt) return { ok: false as const, reason: "not_found" as const };
  return { ok: true as const, attempt };
}

function lookupFailureResponse(reason: "unauthenticated" | "not_found") {
  if (reason === "unauthenticated") {
    return NextResponse.json(
      { error: "Your session has expired. Log in again to continue — your answers are saved." },
      { status: 401 }
    );
  }
  return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getStudentAttempt(params);
  if (!result.ok) return lookupFailureResponse(result.reason);
  const { attempt } = result;

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This attempt is no longer active" }, { status: 409 });
  }

  if (attempt.expiresAt <= new Date()) {
    await endAttempt(attempt.id, "TIMED_OUT", "timeout");
    return NextResponse.json({ error: "The exam time has expired" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questionId = typeof (body as { questionId?: unknown }).questionId === "string"
    ? (body as { questionId: string }).questionId
    : "";
  const rawSelectedIndex = (body as { selectedIndex?: unknown }).selectedIndex;
  if (!questionId || !Number.isInteger(rawSelectedIndex)) {
    return NextResponse.json({ error: "questionId and selectedIndex are required" }, { status: 400 });
  }
  const selectedIndex = rawSelectedIndex as number;

  const question = attempt.questions.find((item) => item.id === questionId);
  if (!question || selectedIndex < 0 || selectedIndex >= question.options.length) {
    return NextResponse.json({ error: "Invalid question or answer" }, { status: 400 });
  }

  await prisma.attemptQuestion.update({
    where: { id: question.id },
    data: { selectedIndex },
  });

  return NextResponse.json({ ok: true, questionId, selectedIndex });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getStudentAttempt(params);
  if (!result.ok) return lookupFailureResponse(result.reason);
  const { attempt } = result;

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This attempt has already ended" }, { status: 409 });
  }

  const timedOut = attempt.expiresAt <= new Date();
  const outcome = await endAttempt(attempt.id, timedOut ? "TIMED_OUT" : "SUBMITTED", timedOut ? "timeout" : "student");
  if (!outcome) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const correctAnswers = timedOut
    ? 0
    : attempt.questions.filter((question) => question.selectedIndex === question.correctIndex).length;

  return NextResponse.json({
    result: {
      attemptId: outcome.attempt.id,
      status: outcome.attempt.status,
      score: outcome.attempt.score,
      passed: outcome.attempt.passed,
      correctAnswers,
      totalQuestions: outcome.questionCount,
    },
  });
}
