import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

const HEADER_ROW = [
  { value: "Student ID", fontWeight: "bold" as const },
  { value: "Full Name", fontWeight: "bold" as const },
  { value: "Email", fontWeight: "bold" as const },
  { value: "Phone", fontWeight: "bold" as const },
  { value: "Age", fontWeight: "bold" as const },
  { value: "Gender", fontWeight: "bold" as const },
  { value: "Address", fontWeight: "bold" as const },
  { value: "Social Media", fontWeight: "bold" as const },
  { value: "Course", fontWeight: "bold" as const },
  { value: "Status", fontWeight: "bold" as const },
  { value: "Registered On", fontWeight: "bold" as const },
];

const COLUMN_WIDTHS = [14, 24, 28, 16, 6, 10, 30, 20, 26, 10, 14];

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const students = await prisma.student.findMany({
    orderBy: { createdAt: "asc" },
    include: { course: { select: { name: true } } },
  });

  const rows = [
    HEADER_ROW,
    ...students.map((s) => [
      { value: s.studentId, type: String },
      { value: s.fullName, type: String },
      { value: s.email, type: String },
      { value: s.phone, type: String },
      { value: s.age, type: Number },
      { value: s.gender, type: String },
      { value: s.address, type: String },
      { value: s.socialMedia ?? "", type: String },
      { value: s.course.name, type: String },
      { value: s.status, type: String },
      { value: s.createdAt.toISOString().slice(0, 10), type: String },
    ]),
  ];

  const buffer = await writeXlsxFile(rows, {
    columns: COLUMN_WIDTHS.map((width) => ({ width })),
  }).toBuffer();

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.export_students",
      detail: `${students.length} students exported`,
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="nakconel-students-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}


