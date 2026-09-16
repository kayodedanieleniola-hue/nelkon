import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const courseId = url.searchParams.get("courseId") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const students = await prisma.student.findMany({
    where: {
      ...(courseId ? { courseId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { studentId: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      studentId: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
      course: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ students });
}
