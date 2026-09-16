import { NextResponse, NextRequest } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const studentSession = await getStudentSession();
  if (!studentSession) {
    return NextResponse.json({ error: "Student login required" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const assignmentId = formData.get("assignmentId") as string;
    const textSubmission = (formData.get("textSubmission") as string) || "";
    const file = formData.get("file") as File | null;

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    // Verify student course match
    const student = await prisma.student.findUnique({
      where: { id: studentSession.sub },
      select: { id: true, courseId: true },
    });

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, courseId: true, dueDate: true },
    });

    if (!student || !assignment || student.courseId !== assignment.courseId) {
      return NextResponse.json({ error: "Unauthorized access to this assignment" }, { status: 403 });
    }

    let fileName: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;
    let fileBuffer: Buffer | null = null;

    if (file && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: "Submission file size exceeds 10 MB limit" }, { status: 400 });
      }
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      sizeBytes = file.size;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    }

    const submission = await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId: student.id,
        },
      },
      update: {
        textSubmission: textSubmission.trim() || null,
        ...(fileName ? { fileName, mimeType, sizeBytes, fileData: fileBuffer } : {}),
        submittedAt: new Date(),
        status: "SUBMITTED",
      },
      create: {
        assignmentId,
        studentId: student.id,
        textSubmission: textSubmission.trim() || null,
        fileName,
        mimeType,
        sizeBytes,
        fileData: fileBuffer,
        status: "SUBMITTED",
      },
    });

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        submittedAt: submission.submittedAt,
        fileName: submission.fileName,
        status: submission.status,
      },
    });
  } catch (error) {
    console.error("Assignment submission error:", error);
    return NextResponse.json({ error: "Failed to submit assignment" }, { status: 500 });
  }
}
