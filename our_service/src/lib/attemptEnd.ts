import { prisma } from "@/lib/db";

type EndedBy = "student" | "timeout" | `admin:${string}`;

type EndOutcome = "SUBMITTED" | "TIMED_OUT" | "TERMINATED";

/**
 * Ends an in-progress attempt and records the result. Used from three
 * places: the student's own submit, the server-detected timeout path, and
 * admin force-submit/terminate — kept in one place so scoring logic can
 * never drift between them.
 *
 * - SUBMITTED (student or admin force-submit): score is computed from
 *   whatever answers exist right now. Force-submit does NOT zero the score
 *   — the student answered what they answered; the admin is just ending
 *   the session early, not penalizing them for it.
 * - TIMED_OUT: score is zero, matching the existing student-facing timeout
 *   behavior (unchanged here — not something this phase was asked to revisit).
 * - TERMINATED: no score at all (null/null) — the attempt is voided, not
 *   graded. This is for genuine integrity actions, not routine wrap-ups.
 */
export async function endAttempt(
  attemptId: string,
  outcome: EndOutcome,
  endedBy: EndedBy,
  endReason?: string
) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: { select: { name: true, passingScore: true } },
      questions: true,
    },
  });
  if (!attempt) return null;

  let score: number | null = null;
  let passed: boolean | null = null;

  if (outcome === "SUBMITTED") {
    const correct = attempt.questions.filter((q) => q.selectedIndex === q.correctIndex).length;
    score = attempt.questions.length > 0 ? Math.round((correct / attempt.questions.length) * 100) : 0;
    passed = score >= attempt.exam.passingScore;
  } else if (outcome === "TIMED_OUT") {
    score = 0;
    passed = false;
  }
  // TERMINATED: score/passed stay null — voided, not graded.

  const completed = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: outcome,
      score,
      passed,
      submittedAt: new Date(),
      endedBy,
      endReason: endReason ?? null,
      pendingWarning: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: endedBy.startsWith("admin:") ? "admin" : "student",
      actorId: endedBy.startsWith("admin:") ? endedBy.slice("admin:".length) : attempt.studentId,
      attemptId,
      action:
        outcome === "TIMED_OUT"
          ? "student.exam_timeout"
          : outcome === "TERMINATED"
          ? "admin.terminate_exam"
          : endedBy.startsWith("admin:")
          ? "admin.force_submit_exam"
          : "student.submit_exam",
      detail: endReason ? `${attempt.exam.name} — ${endReason}` : attempt.exam.name,
    },
  });

  return { attempt: completed, questionCount: attempt.questions.length };
}
