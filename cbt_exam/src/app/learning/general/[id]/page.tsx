import { notFound, redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import GeneralClassroomClient from "@/components/GeneralClassroomClient";

export const dynamic = "force-dynamic";

export default async function GeneralMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  // Any active student can join a general meeting — no course check
  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { id: true, fullName: true, status: true },
  });
  if (!student || student.status !== "active") redirect("/login");

  const { id } = await params;

  const meeting = await prisma.learningClass.findFirst({
    where: { id, isGeneral: true, NOT: { status: "CANCELLED" } },
    select: { id: true, title: true, instructor: true, description: true, status: true },
  });

  if (!meeting) notFound();

  return (
    <GeneralClassroomClient
      meeting={{
        id: meeting.id,
        title: meeting.title,
        instructor: meeting.instructor,
        description: meeting.description,
        status: meeting.status,
      }}
      studentName={student.fullName}
    />
  );
}
