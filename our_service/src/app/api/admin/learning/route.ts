import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { syncLearningClassStatuses } from "@/lib/learningSchedule";

export const dynamic = "force-dynamic";
const STATUSES = new Set(["DRAFT", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]);

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  await syncLearningClassStatuses();
  const courses = await prisma.course.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, materials: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, moduleId: true, classId: true } }, modules: { orderBy: { position: "asc" }, select: { id: true, title: true, description: true, position: true, classes: { orderBy: { startsAt: "asc" }, select: { id: true, title: true, instructor: true, description: true, startsAt: true, endsAt: true, status: true, activeMaterialId: true, isGeneral: true } } } }, classes: { where: { moduleId: null }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, instructor: true, description: true, startsAt: true, endsAt: true, status: true, activeMaterialId: true, isGeneral: true } } } });
  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.type === "module") {
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!courseId || title.length < 2)
      return NextResponse.json({ error: "Choose a course and enter a module title" }, { status: 400 });
    const position = await prisma.learningModule.count({ where: { courseId } });
    const module = await prisma.learningModule.create({
      data: { courseId, title, description: typeof body.description === "string" ? body.description.trim() || null : null, position },
    });
    return NextResponse.json({ module }, { status: 201 });
  }
  if (body?.type === "class") {
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const moduleId = typeof body.moduleId === "string" && body.moduleId ? body.moduleId : null;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "DRAFT";
    const activeMaterialId = typeof body.activeMaterialId === "string" && body.activeMaterialId ? body.activeMaterialId : null;
    const isGeneral = typeof body.isGeneral === "boolean" ? body.isGeneral : false;
    if (!courseId) return NextResponse.json({ error: "Please select a course before creating a class" }, { status: 400 });
    if (title.length < 2) return NextResponse.json({ error: "Please enter a valid class title" }, { status: 400 });
    if (moduleId && !(await prisma.learningModule.findFirst({ where: { id: moduleId, courseId } })))
      return NextResponse.json({ error: "That module does not belong to the selected course" }, { status: 400 });
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt)
      return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
    const learningClass = await prisma.learningClass.create({
      data: { courseId, moduleId, title, instructor: text(body.instructor), description: text(body.description), startsAt, endsAt, status, activeMaterialId, isGeneral },
    });
    return NextResponse.json({ learningClass }, { status: 201 });
  }
  return NextResponse.json({ error: "Unknown Learning Center item type" }, { status: 400 });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id || (body?.type !== "module" && body?.type !== "class"))
    return NextResponse.json({ error: "Invalid update request: missing id or valid type" }, { status: 400 });

  if (body.type === "module") {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 2) return NextResponse.json({ error: "Enter a valid module title" }, { status: 400 });
    const module = await prisma.learningModule.update({ where: { id }, data: { title, description: text(body.description) } });
    return NextResponse.json({ module });
  }

  const existing = await prisma.learningClass.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Learning class not found" }, { status: 404 });

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : existing.title;
  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : existing.status;
  const instructor = body.instructor !== undefined ? text(body.instructor) : existing.instructor;
  const description = body.description !== undefined ? text(body.description) : existing.description;
  const startsAt = body.startsAt !== undefined ? parseDate(body.startsAt) : existing.startsAt;
  const endsAt = body.endsAt !== undefined ? parseDate(body.endsAt) : existing.endsAt;
  const activeMaterialId = body.activeMaterialId !== undefined ? (typeof body.activeMaterialId === "string" && body.activeMaterialId ? body.activeMaterialId : null) : existing.activeMaterialId;
  const isGeneral = typeof body.isGeneral === "boolean" ? body.isGeneral : existing.isGeneral;
  const presentationPage = typeof body.presentationPage === "number" && body.presentationPage >= 1
    ? Math.floor(body.presentationPage)
    : existing.presentationPage ?? 1;
  const recordingUrl = body.recordingUrl !== undefined ? (typeof body.recordingUrl === "string" ? body.recordingUrl : null) : existing.recordingUrl;

  const learningClass = await prisma.learningClass.update({
    where: { id },
    data: { title, instructor, description, startsAt, endsAt, status, activeMaterialId, isGeneral, presentationPage, recordingUrl },
  });
  return NextResponse.json({ learningClass });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin(); if (!guard.ok) return guard.response;
  const url = new URL(request.url); const type = url.searchParams.get("type"); const id = url.searchParams.get("id");
  if (!id || (type !== "module" && type !== "class")) return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
  if (type === "module") await prisma.learningModule.delete({ where: { id } }); else await prisma.learningClass.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function parseDate(value: unknown) { if (typeof value !== "string" || !value) return null; const date = new Date(value); return Number.isNaN(date.valueOf()) ? null : date; }
