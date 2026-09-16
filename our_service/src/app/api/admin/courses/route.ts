import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const courses = await prisma.course.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { students: true, exams: true } },
    },
  });

  return NextResponse.json({ courses });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = (body as { name?: string }).name?.trim();
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Enter a course name" }, { status: 400 });
  }

  const existing = await prisma.course.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A course with this name already exists" }, { status: 409 });
  }

  const course = await prisma.course.create({ data: { name } });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.create_course",
      detail: course.name,
    },
  });

  return NextResponse.json({ course });
}
