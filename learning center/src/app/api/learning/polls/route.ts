import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStudentSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");

    if (!classId) {
      return NextResponse.json({ error: "Missing classId" }, { status: 400 });
    }

    const polls = await prisma.classPoll.findMany({
      where: { classId, active: true },
      include: {
        answers: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedPolls = polls.map((poll: { id: string; classId: string; question: string; options: string[]; answers: { optionIndex: number }[] }) => {
      const counts: Record<number, number> = {};
      poll.options.forEach((_: string, idx: number) => {
        counts[idx] = 0;
      });
      poll.answers.forEach((ans: { optionIndex: number }) => {
        counts[ans.optionIndex] = (counts[ans.optionIndex] || 0) + 1;
      });

      return {
        id: poll.id,
        classId: poll.classId,
        question: poll.question,
        options: poll.options,
        counts,
        totalVotes: poll.answers.length,
        userVotedOption: undefined,
      };
    });

    return NextResponse.json({ polls: formattedPolls });
  } catch (error) {
    console.error("Error fetching class polls:", error);
    return NextResponse.json({ error: "Failed to fetch polls" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getStudentSession();
    const body = await request.json();

    if (body.action === "CREATE_POLL") {
      const { classId, question, options } = body;
      if (!classId || !question || !Array.isArray(options) || options.length < 2) {
        return NextResponse.json({ error: "Invalid poll creation data" }, { status: 400 });
      }

      // Deactivate previous active polls for this class
      await prisma.classPoll.updateMany({
        where: { classId, active: true },
        data: { active: false },
      });

      const poll = await prisma.classPoll.create({
        data: {
          classId,
          question,
          options,
          active: true,
        },
      });

      return NextResponse.json({ success: true, poll });
    }

    if (body.action === "SUBMIT_VOTE") {
      const { pollId, optionIndex } = body;
      const studentId = session?.sub || body.studentId || "anonymous-student";

      if (!pollId || typeof optionIndex !== "number") {
        return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
      }

      const answer = await prisma.classPollAnswer.upsert({
        where: {
          pollId_studentId: { pollId, studentId },
        },
        update: { optionIndex },
        create: {
          pollId,
          studentId,
          optionIndex,
        },
      });

      return NextResponse.json({ success: true, answer });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error processing poll action:", error);
    return NextResponse.json({ error: "Failed to process poll action" }, { status: 500 });
  }
}
