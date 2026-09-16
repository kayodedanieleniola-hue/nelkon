import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { endAttempt } from "@/lib/attemptEnd";

export const dynamic = "force-dynamic";

// Ends a live attempt from the admin side. Requires a reason — this is a
// significant, logged action (spec section 27), never silent or reason-less.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const mode = (body as { mode?: string }).mode;
  const reason = (body as { reason?: string }).reason?.trim();
  if (mode !== "terminate" && mode !== "force_submit") {
    return NextResponse.json({ error: "mode must be 'terminate' or 'force_submit'" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.findUnique({ where: { id } });
  if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "This exam is not currently in progress" }, { status: 409 });
  }

  const outcome = await endAttempt(
    id,
    mode === "terminate" ? "TERMINATED" : "SUBMITTED",
    `admin:${guard.session.sub}`,
    reason
  );
  if (!outcome) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });

  return NextResponse.json({ ok: true, status: outcome.attempt.status });
}
