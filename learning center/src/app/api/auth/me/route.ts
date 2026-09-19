import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getStudentSession();
  if (!session || session.role !== "student") {
    return NextResponse.json({ student: null }, { status: 200 });
  }

  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    include: { course: true },
  });

  if (!student || student.status !== "active") {
    return NextResponse.json({ student: null }, { status: 200 });
  }

  return NextResponse.json({
    student: {
      studentId: student.studentId,
      fullName: student.fullName,
      email: student.email,
      course: student.course.name,
    },
  });
}
