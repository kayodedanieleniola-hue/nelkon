import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const classId = typeof body?.classId === "string" ? body.classId : "";

    if (!classId) {
      return NextResponse.json({ error: "Missing classId" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({
      where: { id: session.sub },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const attendance = await prisma.classAttendance.upsert({
      where: {
        classId_studentId: {
          classId,
          studentId: student.studentId,
        },
      },
      update: {},
      create: {
        classId,
        studentId: student.studentId,
      },
    });

    return NextResponse.json({ success: true, attendance });
  } catch (error) {
    console.error("Attendance API error:", error);
    return NextResponse.json({ error: "Failed to record attendance" }, { status: 500 });
  }
}
