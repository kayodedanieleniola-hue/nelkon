import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

// Per the spec's retention/deletion requirement for biometric-adjacent
// data: an admin can clear a student's stored face descriptor/photo at any
// time. This also resets enrollment — their next exam attempt will capture
// a fresh baseline.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  await prisma.student.update({
    where: { id },
    data: { verificationPhoto: null, verificationDescriptor: null, verificationCapturedAt: null },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.delete_verification_data",
      detail: `${student.studentId} (${student.fullName})`,
    },
  });

  return NextResponse.json({ ok: true });
}
