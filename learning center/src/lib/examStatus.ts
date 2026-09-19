export type ExamStatus = "NOT_CONFIGURED" | "UPCOMING" | "ONGOING" | "CLOSED";

export type ExamLike = {
  published: boolean;
  startAt: Date | null;
  endAt: Date | null;
};

/**
 * Computes exam status purely from server-trusted fields — the admin's
 * published flag and schedule. An exam is never ONGOING just because it
 * exists; it must be published AND within its configured time window.
 *
 * NOTE: this does not yet account for a student's individual attempt
 * (e.g. "COMPLETED" once they've submitted) — that lands in Phase 6/7
 * alongside exam attempts. Until then, a student who finishes an exam
 * within its window will still see it as ONGOING/CLOSED based on the
 * schedule, which is correct: attempt-specific state doesn't exist yet.
 */
export function getExamStatus(exam: ExamLike, now: Date = new Date()): ExamStatus {
  if (!exam.published || !exam.startAt || !exam.endAt) {
    return "NOT_CONFIGURED";
  }
  if (now < exam.startAt) return "UPCOMING";
  if (now > exam.endAt) return "CLOSED";
  return "ONGOING";
}

export const STATUS_LABEL: Record<ExamStatus, string> = {
  NOT_CONFIGURED: "Not configured",
  UPCOMING: "Upcoming",
  ONGOING: "Ongoing",
  CLOSED: "Closed",
};
