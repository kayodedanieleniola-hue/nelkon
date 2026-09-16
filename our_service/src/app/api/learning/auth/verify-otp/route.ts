/**
 * POST /api/learning/auth/verify-otp
 *
 * Step 2 of passwordless login:
 *  1. Validate email + code
 *  2. Re-check eligibility (never trust the client)
 *  3. Verify bcrypt hash, check expiry, check not already used
 *  4. Mark OTP as used
 *  5. Upsert LearningProfile from main DB registration data
 *  6. Create LC session cookie
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { findEligibleTrainingStudent } from "@/lib/mainDb";
import { createLcSession } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  code:  z.string().length(6).regex(/^\d{6}$/),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email: string; code: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();

  // 1. Re-verify eligibility server-side — never trust the client's claim
  let eligibility: Awaited<ReturnType<typeof findEligibleTrainingStudent>>;
  try {
    eligibility = await findEligibleTrainingStudent(email);
  } catch {
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 503 });
  }

  if (!eligibility.eligible) {
    return NextResponse.json({ error: "You are not eligible to access the Learning Center." }, { status: 403 });
  }

  // 2. Find the most recent unused, unexpired OTP for this email
  const otpRecord = await prisma.learningOtp.findFirst({
    where: { email, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return NextResponse.json(
      { error: "Code expired or not found. Please request a new code." },
      { status: 400 }
    );
  }

  // 3. Verify the code
  const valid = await bcrypt.compare(body.code, otpRecord.code);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 400 });
  }

  // 4. Mark OTP as used
  await prisma.learningOtp.update({ where: { id: otpRecord.id }, data: { used: true } });

  // 5. Upsert LearningProfile — create if first login, update status on subsequent logins
  const reg = eligibility.registration;
  const profile = await prisma.learningProfile.upsert({
    where:  { mainRegistrationId: reg.id },
    update: { mainStatus: reg.status, fullName: reg.name, program: reg.program },
    create: {
      mainRegistrationId: reg.id,
      email:   reg.email,
      fullName: reg.name,
      phone:   reg.phone ?? "",
      program: reg.program,
      mainStatus: reg.status,
    },
  });

  // 6. Create authenticated session
  await createLcSession({
    profileId:          profile.id,
    email:              profile.email,
    fullName:           profile.fullName,
    program:            profile.program,
    mainRegistrationId: profile.mainRegistrationId,
  });

  return NextResponse.json({ ok: true });
}
