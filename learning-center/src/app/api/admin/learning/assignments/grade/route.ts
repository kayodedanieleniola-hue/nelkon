import { NextResponse, NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const adminSession = await getAdminSession();
  if (!adminSession) {
    return NextResponse.json({ error: "Administrator login required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { submissionId, score, feedback } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "Submission ID is required" }, { status: 400 });
    }

    const numericScore = score !== undefined && score !== null ? parseInt(score, 10) : null;

    const submission = await prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: {
        score: numericScore,
        feedback: feedback ? feedback.trim() : null,
        status: "GRADED",
      },
    });

    return NextResponse.json({ success: true, submission });
  } catch (error) {
    console.error("Grade assignment error:", error);
    return NextResponse.json({ error: "Failed to grade submission" }, { status: 500 });
  }
}
