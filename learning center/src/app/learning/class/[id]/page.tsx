import { notFound, redirect } from "next/navigation";
import GeneralClassroomClient from "@/components/GeneralClassroomClient";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncLearningClassStatuses } from "@/lib/learningSchedule";

export const dynamic = "force-dynamic";

export default async function ClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStudentSession();
  if (!session) redirect("/login");

  await syncLearningClassStatuses();
  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    select: { fullName: true },
  });
  if (!student) redirect("/login");
  const { id } = await params;
  const learningClass = await prisma.learningClass.findFirst({
    where: {
      id,
      NOT: { status: "CANCELLED" },
      course: { students: { some: { id: session.sub, status: "active" } } },
    },
    select: { id: true, title: true, instructor: true, description: true, status: true },
  });

  if (!learningClass) notFound();

  return <GeneralClassroomClient meeting={learningClass} studentName={student.fullName} />;
}
