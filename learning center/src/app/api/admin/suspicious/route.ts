import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const events = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          "student.login_failed",
          "admin.login_failed",
          "student.exam_timeout",
          "student.identity_mismatch",
          "student.presence_no_face",
          "student.presence_multiple_faces",
          "student.camera_blocked",
          "student.camera_disconnected",
          "student.duplicate_session",
          "student.fullscreen_exited",
          "student.tab_hidden",
          "admin.warn_student",
          "admin.terminate_exam",
          "admin.force_submit_exam",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Resolve actorId -> an actual name, not just a raw database ID. A
  // student's row disappearing (e.g. account deleted) is handled
  // gracefully — the event still shows, just without a name attached.
  const studentIds = [...new Set(events.filter((e) => e.actorType === "student" && e.actorId).map((e) => e.actorId!))];
  const adminIds = [...new Set(events.filter((e) => e.actorType === "admin" && e.actorId).map((e) => e.actorId!))];

  const [students, admins] = await Promise.all([
    studentIds.length
      ? prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, studentId: true, fullName: true } })
      : Promise.resolve([]),
    adminIds.length
      ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const adminById = new Map(admins.map((a) => [a.id, a]));

  const enriched = events.map((event) => {
    if (event.actorType === "student" && event.actorId) {
      const student = studentById.get(event.actorId);
      return {
        ...event,
        actorName: student?.fullName ?? null,
        actorLabel: student?.studentId ?? null,
      };
    }
    if (event.actorType === "admin" && event.actorId) {
      const admin = adminById.get(event.actorId);
      return { ...event, actorName: admin?.fullName ?? null, actorLabel: null };
    }
    return { ...event, actorName: null, actorLabel: null };
  });

  return NextResponse.json({ events: enriched });
}
