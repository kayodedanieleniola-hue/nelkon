/**
 * POST /api/admin/students/activate
 *
 * Admin activates a student by email + course.
 * Creates a Student record in the Learning Center DB so the student
 * can log in at /login with just their email.
 *
 * If the student already exists, updates their course and sets status=active.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { generateStudentId } from "@/lib/studentId";
import { hashPassword } from "@/lib/password";

const bodySchema = z.object({
  email:    z.string().email(),
  fullName: z.string().min(2),
  courseId: z.string().min(1),
  phone:    z.string().optional().default(""),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e: any) {
    return NextResponse.json({ error: "Invalid input: " + (e.errors?.[0]?.message ?? "check all fields") }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();
  const fullName = body.fullName.trim();

  // Verify course exists
  const course = await prisma.course.findUnique({ where: { id: body.courseId } });
  if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  // Check if student already exists
  const existing = await prisma.student.findFirst({ where: { email } });

  if (existing) {
    // Update: set course + activate
    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: { courseId: body.courseId, status: "active", fullName, phone: body.phone || existing.phone },
      include: { course: true },
    });
  await prisma.auditLog.create({
    data: { actorType: "admin", actorId: guard.session.sub, action: "admin.activate_student", detail: `${email} → ${course.name}` },
  });
    return NextResponse.json({ student: { id: updated.id, studentId: updated.studentId, fullName: updated.fullName, email: updated.email, course: updated.course.name, status: updated.status }, created: false });
  }

  // Create new student
  const studentId = await generateStudentId();
  // Generate a secure random password — student doesn't need it (email-only login)
  // but the schema requires passwordHash so we set one they'll never use
  const passwordHash = await hashPassword(`${studentId}-${Date.now()}`);

  const student = await prisma.student.create({
    data: {
      studentId,
      fullName,
      email,
      phone:        body.phone || "—",
      age:          0,
      gender:       "—",
      address:      "—",
      passwordHash,
      status:       "active",
      courseId:     body.courseId,
    },
    include: { course: true },
  });

  await prisma.auditLog.create({
    data: { actorType: "admin", actorId: guard.session.sub, action: "admin.activate_student", detail: `${email} → ${course.name} (${studentId})` },
  });

  return NextResponse.json({
    student: { id: student.id, studentId: student.studentId, fullName: student.fullName, email: student.email, course: student.course.name, status: student.status },
    created: true,
  }, { status: 201 });
}
