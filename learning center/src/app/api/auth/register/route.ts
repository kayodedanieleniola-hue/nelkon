import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

// Without this, Next.js can statically cache the GET handler below at build
// time — which is exactly what caused the course list to get frozen as
// empty before any courses existed in the database.
export const dynamic = "force-dynamic";


export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req, "register"), 5, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const data = parsed.data;

  // Confirm the course exists and is active — never trust a client-supplied
  // courseId blindly, since it drives future exam access.
  const course = await prisma.course.findUnique({ where: { id: data.courseId } });
  if (!course || !course.active) {
    return NextResponse.json({ error: "Selected course is not available" }, { status: 400 });
  }

  const existing = await prisma.student.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(data.password);
  const registrationYear = new Date().getFullYear();

  try {
    const student = await prisma.$transaction(async (tx) => {
      const counter = await tx.studentIdCounter.upsert({
        where: { year: registrationYear },
        create: { year: registrationYear, count: 1 },
        update: { count: { increment: 1 } },
      });
      const studentId = `NAK-${registrationYear}-${String(counter.count).padStart(3, "0")}`;

      return tx.student.create({
        data: {
          studentId,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          age: data.age,
          gender: data.gender,
          address: data.address,
          socialMedia: data.socialMedia || null,
          passwordHash,
          courseId: data.courseId,
        },
        include: { course: true },
      });
    });

    await prisma.auditLog.create({
      data: {
        actorType: "student",
        actorId: student.id,
        action: "student.register",
        detail: `Registered as ${student.studentId} for ${student.course.name}`,
      },
    });

    await createSession({ sub: student.id, role: "student", studentId: student.studentId });

    return NextResponse.json({
      studentId: student.studentId,
      fullName: student.fullName,
      email: student.email,
      course: student.course.name,
    });
  } catch (err) {
    console.error("Registration failed", err);
    return NextResponse.json(
      { error: "Something went wrong while registering. Please try again." },
      { status: 500 }
    );
  }
}

// Public: lists active courses for the registration form's course picker.
export async function GET() {
  const courses = await prisma.course.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ courses });
}
