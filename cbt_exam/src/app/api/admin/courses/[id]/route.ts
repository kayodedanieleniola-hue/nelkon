import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, active } = body as { name?: string; active?: boolean };
  const data: { name?: string; active?: boolean } = {};

  if (typeof name === "string") {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      return NextResponse.json({ error: "Course name is too short" }, { status: 400 });
    }
    data.name = trimmed;
  }

  if (typeof active === "boolean") {
    data.active = active;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const course = await prisma.course.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        actorType: "admin",
        actorId: guard.session.sub,
        action: "admin.update_course",
        detail: `${course.name} — ${JSON.stringify(data)}`,
      },
    });

    return NextResponse.json({ course });
  } catch {
    return NextResponse.json({ error: "Course not found or name already in use" }, { status: 400 });
  }
}
