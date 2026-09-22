import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import GeneralClassroomClient from "@/components/GeneralClassroomClient";

export const dynamic = "force-dynamic";

export default async function AdminGeneralMeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const admin = await prisma.admin.findUnique({
    where: { id: session.sub },
    select: { fullName: true, status: true },
  });
  if (!admin || admin.status !== "active") redirect("/admin/login");

  const { id } = await params;

  const meeting = await prisma.learningClass.findFirst({
    where: { id, isGeneral: true, NOT: { status: "CANCELLED" } },
    select: {
      id: true,
      title: true,
      instructor: true,
      description: true,
      status: true,
    },
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
      studentName={admin.fullName}
      isInstructor
      backHref="/admin/learning"
    />
  );
}
