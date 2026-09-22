import { NextResponse, NextRequest } from "next/server";
import { getStudentSession, getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/learning/questions?classId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("classId");

  if (!classId) {
    return NextResponse.json({ error: "Class ID is required" }, { status: 400 });
  }

  try {
    const questions = await prisma.classQuestion.findMany({
      where: { classId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Fetch class questions error:", error);
    return NextResponse.json({ error: "Failed to fetch class questions" }, { status: 500 });
  }
}

// POST /api/learning/questions (Student submits question or instructor marks answered)
export async function POST(request: NextRequest) {
  const studentSession = await getStudentSession();
  const adminSession = await getAdminSession();

  if (!studentSession && !adminSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, classId, questionId, question, answer } = body;

    if (action === "SUBMIT") {
      if (!classId || !question) {
        return NextResponse.json({ error: "Class ID and question text are required" }, { status: 400 });
      }

      const student = studentSession
        ? await prisma.student.findUnique({ where: { id: studentSession.sub }, select: { id: true, fullName: true } })
        : null;

      const created = await prisma.classQuestion.create({
        data: {
          classId,
          studentId: student ? student.id : "admin-user",
          studentName: student ? student.fullName : "Instructor",
          question: question.trim(),
        },
      });

      return NextResponse.json({ success: true, question: created });
    }

    if (action === "ANSWER") {
      if (!adminSession) {
        return NextResponse.json({ error: "Instructor authorization required to answer" }, { status: 403 });
      }

      if (!questionId) {
        return NextResponse.json({ error: "Question ID is required" }, { status: 400 });
      }

      const updated = await prisma.classQuestion.update({
        where: { id: questionId },
        data: {
          answered: true,
          answer: answer ? answer.trim() : "Answered live in broadcast.",
        },
      });

      return NextResponse.json({ success: true, question: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Manage class question error:", error);
    return NextResponse.json({ error: "Failed to manage class question" }, { status: 500 });
  }
}
