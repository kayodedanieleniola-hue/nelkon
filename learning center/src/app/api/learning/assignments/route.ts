import { NextResponse, NextRequest } from "next/server";
import { getStudentSession, getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/learning/assignments?courseId=...&classId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId");
  const classId = searchParams.get("classId");

  const studentSession = await getStudentSession();
  const adminSession = await getAdminSession();

  if (!studentSession && !adminSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let targetCourseId = courseId;

    if (studentSession && !targetCourseId) {
      const student = await prisma.student.findUnique({
        where: { id: studentSession.sub },
        select: { courseId: true },
      });
      if (student) targetCourseId = student.courseId;
    }

    if (!targetCourseId) {
      return NextResponse.json({ error: "Course ID is required" }, { status: 400 });
    }

    // Anti-IDOR check for students
    if (studentSession) {
      const student = await prisma.student.findUnique({
        where: { id: studentSession.sub },
        select: { courseId: true, id: true },
      });
      if (!student || student.courseId !== targetCourseId) {
        return NextResponse.json({ error: "Unauthorized access to course assignments" }, { status: 403 });
      }
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        courseId: targetCourseId,
        ...(classId ? { classId } : {}),
      },
      include: {
        learningClass: { select: { id: true, title: true } },
        module: { select: { id: true, title: true } },
        submissions: studentSession
          ? {
              where: { studentId: studentSession.sub },
              select: {
                id: true,
                fileName: true,
                textSubmission: true,
                submittedAt: true,
                score: true,
                feedback: true,
                status: true,
              },
            }
          : {
              include: {
                student: { select: { id: true, studentId: true, fullName: true } },
              },
            },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Fetch assignments error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

// POST /api/learning/assignments (Admin/Instructor create assignment)
export async function POST(request: NextRequest) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Administrator authorization required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, description, instructions, courseId, moduleId, classId, dueDate, maxScore } = body;

    if (!title || !courseId) {
      return NextResponse.json({ error: "Title and Course ID are required" }, { status: 400 });
    }

    const assignment = await prisma.assignment.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        instructions: instructions ? instructions.trim() : null,
        courseId,
        moduleId: moduleId || null,
        classId: classId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        maxScore: maxScore ? parseInt(maxScore, 10) : 100,
      },
    });

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error("Create assignment error:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}
