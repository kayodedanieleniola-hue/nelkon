import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

const HEADER_ROW = [
  { value: "Student ID", fontWeight: "bold" as const },
  { value: "Full Name", fontWeight: "bold" as const },
  { value: "Email", fontWeight: "bold" as const },
  { value: "Course", fontWeight: "bold" as const },
  { value: "Exam", fontWeight: "bold" as const },
  { value: "Score (%)", fontWeight: "bold" as const },
  { value: "Passing Score (%)", fontWeight: "bold" as const },
  { value: "Result", fontWeight: "bold" as const },
  { value: "Status", fontWeight: "bold" as const },
  { value: "Submitted On", fontWeight: "bold" as const },
];

const COLUMN_WIDTHS = [14, 24, 28, 26, 22, 10, 14, 12, 12, 16];

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? "";
  const examId = url.searchParams.get("examId") ?? "";

  const attempts = await prisma.examAttempt.findMany({
    where: {
      status: { in: ["SUBMITTED", "TIMED_OUT", "TERMINATED"] },
      ...(examId ? { examId } : {}),
      ...(courseId ? { exam: { courseId } } : {}),
    },
    orderBy: { submittedAt: "asc" },
    include: {
      student: { select: { studentId: true, fullName: true, email: true } },
      exam: { select: { name: true, passingScore: true, course: { select: { name: true } } } },
    },
  });

  const rows = [
    HEADER_ROW,
    ...attempts.map((a) => [
      { value: a.student.studentId, type: String },
      { value: a.student.fullName, type: String },
      { value: a.student.email, type: String },
      { value: a.exam.course.name, type: String },
      { value: a.exam.name, type: String },
      { value: a.score ?? "", type: a.score === null ? String : Number },
      { value: a.exam.passingScore, type: Number },
      { value: a.status === "TERMINATED" ? "N/A" : a.passed ? "Passed" : "Not passed", type: String },
      { value: a.status, type: String },
      { value: a.submittedAt ? a.submittedAt.toISOString().slice(0, 10) : "", type: String },
    ]),
  ];

  const buffer = await writeXlsxFile(rows, {
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
  }).toBuffer();

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.export_results",
      detail: `${attempts.length} results exported`,
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nakconel-results-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
