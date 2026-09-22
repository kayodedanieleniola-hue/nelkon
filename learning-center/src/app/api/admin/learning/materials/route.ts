import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

// 10 MB max upload size
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ── Allowed file types (extension → MIME types) ───────────────────────────────
// Enforced on both extension AND MIME type. Magic-byte checks are applied for
// the most common formats to defeat MIME-spoofing uploads.
const ALLOWED: Record<string, string[]> = {
  // Documents
  pdf:  ["application/pdf"],
  doc:  ["application/msword", "application/vnd.ms-word"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt:  ["text/plain"],
  // Spreadsheets
  xls:  ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  csv:  ["text/csv", "application/csv", "text/plain"],
  // Presentations
  ppt:  ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  // Images
  png:  ["image/png"],
  jpg:  ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  svg:  ["image/svg+xml"],
};

// Magic-byte signatures for formats where spoofing is a real risk
const MAGIC: Record<string, { bytes: number[]; offset?: number }> = {
  pdf:  { bytes: [0x25, 0x50, 0x44, 0x46] },               // %PDF
  png:  { bytes: [0x89, 0x50, 0x4e, 0x47] },               // \x89PNG
  jpg:  { bytes: [0xff, 0xd8, 0xff] },                      // SOI marker
  jpeg: { bytes: [0xff, 0xd8, 0xff] },
  webp: { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },    // RIFF (need bytes 8-11 = WEBP, checked below)
};

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function checkMagicBytes(ext: string, buf: Uint8Array): boolean {
  const sig = MAGIC[ext];
  if (!sig) return true; // no magic check for this type — rely on MIME
  const offset = sig.offset ?? 0;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buf[offset + i] !== sig.bytes[i]) return false;
  }
  // Extra WEBP check: bytes 8-11 must be "WEBP"
  if (ext === "webp") {
    const webp = [0x57, 0x45, 0x42, 0x50];
    for (let i = 0; i < 4; i++) {
      if (buf[8 + i] !== webp[i]) return false;
    }
  }
  return true;
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });

  const courseId = String(form.get("courseId") ?? "").trim();
  const moduleId = String(form.get("moduleId") ?? "").trim() || null;
  const classId  = String(form.get("classId")  ?? "").trim() || null;
  const title    = String(form.get("title")    ?? "").trim();
  const file     = form.get("file");

  if (!courseId) return NextResponse.json({ error: "Course is required" }, { status: 400 });
  if (title.length < 2) return NextResponse.json({ error: "Material title must be at least 2 characters" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "A file is required" }, { status: 400 });

  // ── Size check ────────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File is too large. Maximum allowed size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.` },
      { status: 400 }
    );
  }

  // ── Extension check ───────────────────────────────────────────────────────
  const ext = getExtension(file.name);
  if (!ext || !ALLOWED[ext]) {
    return NextResponse.json(
      { error: `File type ".${ext || "unknown"}" is not allowed. Allowed types: PDF, DOC, DOCX, TXT, XLS, XLSX, CSV, PPT, PPTX, PNG, JPG, JPEG, WebP, SVG.` },
      { status: 400 }
    );
  }

  // ── MIME type check ───────────────────────────────────────────────────────
  const fileMime = file.type.toLowerCase().split(";")[0].trim();
  const allowedMimes = ALLOWED[ext];
  if (!allowedMimes.includes(fileMime) && fileMime !== "") {
    // Some browsers send empty MIME for plain text/CSV — allow if ext matches
    return NextResponse.json(
      { error: `MIME type "${fileMime}" does not match extension ".${ext}". Please upload a valid file.` },
      { status: 400 }
    );
  }

  // ── Magic-byte check ──────────────────────────────────────────────────────
  const arrayBuf = await file.arrayBuffer();
  const header   = new Uint8Array(arrayBuf.slice(0, 16));
  if (!checkMagicBytes(ext, header)) {
    return NextResponse.json(
      { error: `File content does not match its extension ".${ext}". The file may be corrupt or mislabelled.` },
      { status: 400 }
    );
  }

  // ── DB validation ─────────────────────────────────────────────────────────
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  if (moduleId && !(await prisma.learningModule.findFirst({ where: { id: moduleId, courseId } }))) {
    return NextResponse.json({ error: "Module does not belong to this course" }, { status: 400 });
  }

  if (classId && !(await prisma.learningClass.findFirst({ where: { id: classId, courseId } }))) {
    return NextResponse.json({ error: "Class does not belong to this course" }, { status: 400 });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const mimeToStore = fileMime || allowedMimes[0]; // fallback to first allowed MIME if browser sent empty
  const material = await prisma.learningMaterial.create({
    data: {
      courseId,
      moduleId,
      classId,
      title,
      fileName: file.name || "material",
      mimeType: mimeToStore,
      sizeBytes: file.size,
      data: Buffer.from(arrayBuf),
    },
    select: { id: true, title: true, fileName: true },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "admin",
      actorId: guard.session.sub,
      action: "admin.upload_learning_material",
      detail: `${course.name}: ${material.title} (${ext}, ${Math.ceil(file.size / 1024)} KB)`,
    },
  });

  return NextResponse.json({ material }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Material ID is required" }, { status: 400 });

  await prisma.learningMaterial.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
