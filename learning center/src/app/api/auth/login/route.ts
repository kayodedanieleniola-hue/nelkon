/**
 * POST /api/auth/login
 *
 * Student login — email only. No password required.
 *
 * Priority order:
 *  1. Check career_registrations in main Nakconel DB (MAIN_DATABASE_URL)
 *     → If found as TRAINING + not blocked → allow
 *  2. Fallback: check this project's own students table
 *     → Students already in the CBT system can still log in
 *     → This ensures existing students are never locked out
 *
 * If neither check passes → 403 with message to register at nakconel.company
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit";
import { findEligibleTrainingStudent } from "@/lib/mainDb";

const bodySchema = z.object({ email: z.string().email() });

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req, "login"), 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  let body: { email: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();

  // ── Step 1: Look up student in this project's own DB ─────────────────────
  // We do this first so existing CBT students always work, regardless of
  // whether MAIN_DATABASE_URL is configured or the main DB has their record.
  const student = await prisma.student.findFirst({
    where: { email },
    include: { course: true },
  });

  if (student) {
    if (student.status !== "active") {
      return NextResponse.json(
        { error: "Your exam account has been disabled. Contact your administrator." },
        { status: 403 }
      );
    }
    // Student exists in CBT DB — log them in directly
    await createSession({ sub: student.id, role: "student", studentId: student.studentId });
    await prisma.auditLog.create({
      data: { actorType: "student", actorId: student.id, action: "student.login" },
    });
    return NextResponse.json({
      studentId: student.studentId,
      fullName:  student.fullName,
      email:     student.email,
      course:    student.course.name,
    });
  }

  // ── Step 2: Student not in CBT DB — check main Nakconel DB ───────────────
  // Only runs if MAIN_DATABASE_URL is configured
  if (!process.env.MAIN_DATABASE_URL) {
    // Main DB not configured — can't verify external students
    return NextResponse.json(
      {
        error:
          "This email is not registered in the exam system. If you have registered for Nakconel training, please contact your administrator to activate your exam account.",
      },
      { status: 403 }
    );
  }

  let eligibility: Awaited<ReturnType<typeof findEligibleTrainingStudent>>;
  try {
    eligibility = await findEligibleTrainingStudent(email);
  } catch (err) {
    console.error("[login] main DB check failed:", err);
    return NextResponse.json(
      {
        error:
          "This email is not registered in the exam system. If you registered for Nakconel training, please contact your administrator.",
      },
      { status: 403 }
    );
  }

  if (!eligibility.eligible) {
    const messages: Record<string, string> = {
      email_not_found:
        "This email is not registered for Nakconel training. Please register at nakconel.company to get access.",
      not_training:
        "This email is registered for an internship, not a training programme. Only training students can access the exam portal. Register for training at nakconel.company.",
      status_blocked:
        "Your Nakconel registration is currently inactive. Please contact support at nakconel.company.",
    };
    return NextResponse.json(
      {
        error:
          messages[eligibility.reason] ??
          "You are not eligible to access the exam portal. Visit nakconel.company to register.",
      },
      { status: 403 }
    );
  }

  // Registered with main Nakconel but no CBT exam account yet
  return NextResponse.json(
    {
      error:
        "Your Nakconel training registration was found, but your exam account has not been set up yet. Please contact your administrator to activate your exam access.",
    },
    { status: 404 }
  );
}
