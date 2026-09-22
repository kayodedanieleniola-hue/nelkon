import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getStudentSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const student = await prisma.student.findUnique({
      where: { id: session.sub },
    });

    if (!student) {
      return NextResponse.json({ error: "Student record not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId") || student.courseId;

    if (!courseId) {
      return NextResponse.json({ error: "Missing courseId" }, { status: 400 });
    }

    // Check course details and progress
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        classes: true,
        exams: true,
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Calculate progress (completed classes attended + exams passed)
    const attendances = await prisma.classAttendance.findMany({
      where: { studentId: student.studentId },
    });

    const attempts = await prisma.examAttempt.findMany({
      where: { studentId: student.id, passed: true },
    });

    const totalClasses = course.classes.length || 1;
    const totalExams = course.exams.length || 1;

    const attendedCount = attendances.length;
    const passedExamsCount = attempts.length;

    // Progress percentage formula
    const progressPercent = Math.min(
      100,
      Math.round(((attendedCount / totalClasses) * 0.5 + (passedExamsCount / totalExams) * 0.5) * 100) || 100
    );

    // Get or issue certificate
    let certificate = await prisma.courseCertificate.findUnique({
      where: {
        studentId_courseId: {
          studentId: student.studentId,
          courseId: course.id,
        },
      },
    });

    if (!certificate && progressPercent >= 50) {
      const code = `CERT-NAK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      certificate = await prisma.courseCertificate.create({
        data: {
          studentId: student.studentId,
          courseId: course.id,
          code,
          grade: progressPercent >= 85 ? "FIRST CLASS HONORS" : "EXCELLENCE",
        },
      });
    }

    return NextResponse.json({
      progressPercent,
      attendedCount,
      totalClasses,
      passedExamsCount,
      totalExams,
      certificate: certificate
        ? {
            code: certificate.code,
            issuedAt: certificate.issuedAt,
            grade: certificate.grade,
            studentName: student.fullName || "Enrolled Student",
            studentId: student.studentId,
            courseName: course.name,
          }
        : null,
    });
  } catch (error) {
    console.error("Certificate API error:", error);
    return NextResponse.json({ error: "Failed to load certificate details" }, { status: 500 });
  }
}
