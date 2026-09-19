import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// A face-recognition embedding distance below this is treated as the same
// person. 0.6 is the threshold face-api.js itself documents/uses by
// default for its FaceMatcher — not something we invented.
const IDENTITY_MATCH_THRESHOLD = 0.6;

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

type Lookup =
  | { ok: true; attempt: NonNullable<Awaited<ReturnType<typeof findAttempt>>>; studentId: string }
  | { ok: false; reason: "unauthenticated" | "not_found" };

async function findAttempt(id: string, studentId: string) {
  return prisma.examAttempt.findFirst({
    where: { id, studentId },
    include: { exam: { select: { name: true } } },
  });
}

// Distinguishes "you're not logged in right now" (recoverable — log back in
// and resume, your answers are already saved) from "this attempt genuinely
// doesn't exist for you" (not recoverable). Collapsing these into the same
// 404 was actively misleading a student whose session cookie just didn't
// make it through a background tab reload.
async function getActiveAttempt(id: string): Promise<Lookup> {
  const session = await getStudentSession();
  if (!session || session.role !== "student") return { ok: false, reason: "unauthenticated" };

  const attempt = await findAttempt(id, session.sub);
  if (!attempt || attempt.status !== "IN_PROGRESS") return { ok: false, reason: "not_found" };
  return { ok: true, attempt, studentId: session.sub };
}

// Unlike getActiveAttempt, this doesn't require IN_PROGRESS — the whole
// point of a heartbeat is to also detect and report when an admin has just
// ended the attempt out from under a still-open tab.
async function getAttemptAnyStatus(id: string): Promise<Lookup> {
  const session = await getStudentSession();
  if (!session || session.role !== "student") return { ok: false, reason: "unauthenticated" };

  const attempt = await findAttempt(id, session.sub);
  if (!attempt) return { ok: false, reason: "not_found" };
  return { ok: true, attempt, studentId: session.sub };
}

function lookupFailureResponse(result: Extract<Lookup, { ok: false }>) {
  if (result.reason === "unauthenticated") {
    return NextResponse.json(
      { error: "Your session has expired. Log in again to continue — your answers are saved." },
      { status: 401 }
    );
  }
  return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
}

type Body =
  | { type: "identity"; descriptor: number[]; photo?: string }
  | { type: "presence"; facesDetected: number }
  | { type: "camera"; event: "ready" | "blocked" | "disconnected" }
  | { type: "focus"; event: "fullscreen_exited" | "tab_hidden" }
  | { type: "heartbeat"; sessionId: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const b = body as Partial<Body>;

  // Heartbeat uses its own lookup (doesn't require IN_PROGRESS) so it can
  // report back when an admin has just ended the attempt.
  if (b.type === "heartbeat") {
    const result = await getAttemptAnyStatus(id);
    if (!result.ok) return lookupFailureResponse(result);
    const { attempt } = result;

    const sessionId = b.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      return NextResponse.json({ error: "Missing session identifier" }, { status: 400 });
    }

    if (attempt.status !== "IN_PROGRESS") {
      return NextResponse.json({
        ok: true,
        ended: true,
        status: attempt.status,
        endedBy: attempt.endedBy,
        endReason: attempt.endReason,
      });
    }

    if (attempt.activeSessionId && attempt.activeSessionId !== sessionId) {
      return NextResponse.json({ ok: true, superseded: true });
    }

    const updated = await prisma.examAttempt.update({
      where: { id: attempt.id },
      data: { activeSessionAt: new Date(), pendingWarning: null },
    });

    return NextResponse.json({ ok: true, warning: attempt.pendingWarning ?? undefined, endsAt: updated.expiresAt });
  }

  const result = await getActiveAttempt(id);
  if (!result.ok) return lookupFailureResponse(result);
  const { attempt, studentId } = result;

  if (b.type === "identity") {
    const descriptor = b.descriptor;
    if (!Array.isArray(descriptor) || descriptor.length < 32 || !descriptor.every((n) => typeof n === "number")) {
      return NextResponse.json({ error: "Invalid descriptor" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // No baseline yet — this becomes the enrolled reference for every
    // future attempt. Never overwritten automatically; only an admin can
    // clear it (student detail page), which resets enrollment on purpose.
    if (!student.verificationDescriptor) {
      await prisma.student.update({
        where: { id: studentId },
        data: {
          verificationDescriptor: JSON.stringify(descriptor),
          verificationPhoto: typeof b.photo === "string" ? b.photo.slice(0, 200_000) : null,
          verificationCapturedAt: new Date(),
        },
      });
      await prisma.auditLog.create({
        data: {
          actorType: "student",
          actorId: studentId,
          attemptId: attempt.id,
          action: "student.identity_baseline_set",
          detail: attempt.exam.name,
        },
      });
      return NextResponse.json({ status: "baseline_set" });
    }

    const baseline: number[] = JSON.parse(student.verificationDescriptor);
    const distance = euclideanDistance(baseline, descriptor);
    const matched = distance <= IDENTITY_MATCH_THRESHOLD;

    await prisma.auditLog.create({
      data: {
        actorType: "student",
        actorId: studentId,
        attemptId: attempt.id,
        action: matched ? "student.identity_verified" : "student.identity_mismatch",
        detail: `${attempt.exam.name} — distance ${distance.toFixed(3)}`,
      },
    });

    return NextResponse.json({ status: matched ? "match" : "mismatch", distance });
  }

  if (b.type === "presence") {
    const count = b.facesDetected;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      return NextResponse.json({ error: "Invalid facesDetected" }, { status: 400 });
    }

    // Only genuinely abnormal states are worth an admin's attention —
    // "1 face" (normal) is intentionally not logged at all, so this signal
    // stays a review flag rather than noise, per the spec's caution against
    // treating a single AI signal as proof of anything.
    if (count === 0 || count >= 2) {
      await prisma.auditLog.create({
        data: {
          actorType: "student",
          actorId: studentId,
          attemptId: attempt.id,
          action: count === 0 ? "student.presence_no_face" : "student.presence_multiple_faces",
          detail: attempt.exam.name,
        },
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (b.type === "camera") {
    if (b.event !== "ready" && b.event !== "blocked" && b.event !== "disconnected") {
      return NextResponse.json({ error: "Invalid camera event" }, { status: 400 });
    }
    if (b.event !== "ready") {
      await prisma.auditLog.create({
        data: {
          actorType: "student",
          actorId: studentId,
          attemptId: attempt.id,
          action: b.event === "blocked" ? "student.camera_blocked" : "student.camera_disconnected",
          detail: attempt.exam.name,
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.type === "focus") {
    if (b.event !== "fullscreen_exited" && b.event !== "tab_hidden") {
      return NextResponse.json({ error: "Invalid focus event" }, { status: 400 });
    }
    await prisma.auditLog.create({
      data: {
        actorType: "student",
        actorId: studentId,
        attemptId: attempt.id,
        action: b.event === "fullscreen_exited" ? "student.fullscreen_exited" : "student.tab_hidden",
        detail: attempt.exam.name,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
}
