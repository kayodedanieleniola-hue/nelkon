import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { getStudentSession, getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Checked independently and deliberately — this route is used by both
  // roles, so it must never let a leftover session for one role shadow an
  // intended request from the other (which a single "pick whichever
  // exists" check would risk once both can be logged in simultaneously).
  const studentSession = await getStudentSession();
  const adminSession = await getAdminSession();
  if (!studentSession && !adminSession) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const viewer = url.searchParams.get("viewer");
  if (viewer !== "student" && viewer !== "admin") {
    return NextResponse.json({ error: "viewer must be student or admin" }, { status: 400 });
  }
  const attemptId = url.searchParams.get("attemptId") ?? "";
  if (!attemptId) return NextResponse.json({ error: "attemptId is required" }, { status: 400 });

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { student: { select: { studentId: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  const isStudent = viewer === "student" && !!studentSession && attempt.studentId === studentSession.sub;
  const isAdmin = viewer === "admin" && !!adminSession;
  if (!isStudent && !isAdmin) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (isStudent && attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This exam attempt is no longer active" }, { status: 409 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: "Live video is not configured" }, { status: 503 });
  }

  const room = `exam-${attempt.id}`;
  const identity = isStudent ? `student-${attempt.student.studentId}` : `admin-${adminSession!.sub}`;
  const token = new AccessToken(apiKey, apiSecret, { identity, name: identity, ttl: "24h" });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: isStudent,
    canSubscribe: isAdmin, // students only ever publish here; nothing for them to subscribe to
    canPublishData: false,
  });

  return NextResponse.json({ token: await token.toJwt(), url: livekitUrl, room });
}
