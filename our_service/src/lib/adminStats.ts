import { prisma } from "@/lib/db";
import { getExamStatus } from "@/lib/examStatus";

export async function getOverviewStats() {
  const [totalStudents, totalCourses, exams, recentStudents] = await Promise.all([
    prisma.student.count({ where: { status: "active" } }),
    prisma.course.count({ where: { active: true } }),
    prisma.exam.findMany({ select: { published: true, startAt: true, endAt: true } }),
    prisma.student.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { studentId: true, fullName: true, createdAt: true, course: { select: { name: true } } },
    }),
  ]);

  const now = new Date();
  let upcoming = 0;
  let ongoing = 0;
  let closed = 0;
  let notConfigured = 0;

  for (const exam of exams) {
    const status = getExamStatus(exam, now);
    if (status === "UPCOMING") upcoming++;
    else if (status === "ONGOING") ongoing++;
    else if (status === "CLOSED") closed++;
    else notConfigured++;
  }

  return {
    totalStudents,
    totalCourses,
    exams: { total: exams.length, upcoming, ongoing, closed, notConfigured },
    recentStudents: recentStudents.map((s) => ({
      studentId: s.studentId,
      fullName: s.fullName,
      course: s.course.name,
      createdAt: s.createdAt,
    })),
  };
}
