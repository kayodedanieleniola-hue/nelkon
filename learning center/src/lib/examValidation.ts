import { prisma } from "@/lib/db";

export type PublishCheck = { label: string; ok: boolean };

export type PublishValidation = {
  canPublish: boolean;
  checks: PublishCheck[];
};

/**
 * Mirrors the spec's exam-publishing checklist exactly (section 37/10):
 * an exam can never be published unless every one of its configured
 * questions actually exists as a valid question in the bank.
 */
export async function getPublishValidation(exam: {
  id?: string;
  numQuestions: number;
  durationMinutes: number;
  passingScore: number;
  startAt: Date | null;
  endAt: Date | null;
  courseId: string;
}): Promise<PublishValidation> {
  // Will start returning a real count once the Question model exists.
  const availableQuestions = await countAvailableQuestions(exam.courseId, exam.id);

  const checks: PublishCheck[] = [
    { label: `${exam.numQuestions} question(s) configured`, ok: exam.numQuestions >= 1 },
    {
      label: `${availableQuestions} of ${exam.numQuestions} valid questions available in the Question Bank`,
      ok: availableQuestions === exam.numQuestions && exam.numQuestions >= 1,
    },
    { label: "Duration configured", ok: exam.durationMinutes >= 1 },
    { label: "Passing score configured (0–100%)", ok: exam.passingScore >= 0 && exam.passingScore <= 100 },
    { label: "Start date/time configured", ok: !!exam.startAt },
    { label: "End date/time configured", ok: !!exam.endAt },
    {
      label: "End time is after start time",
      ok: !!exam.startAt && !!exam.endAt && exam.endAt.getTime() > exam.startAt.getTime(),
    },
  ];

  return { canPublish: checks.every((c) => c.ok), checks };
}

async function countAvailableQuestions(courseId: string, examId?: string): Promise<number> {
  return prisma.question.count({ where: { courseId, examId, active: true } });
}
