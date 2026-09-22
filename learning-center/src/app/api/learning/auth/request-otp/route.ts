/**
 * POST /api/learning/auth/request-otp
 *
 * Step 1 of passwordless login:
 *  1. Validate email format
 *  2. Check main Nakconel DB — must be a TRAINING registration with non-blocked status
 *  3. Generate 6-digit OTP, hash with bcrypt, store in learning_otps (expires 10 min)
 *  4. Send code via Resend email
 *
 * Returns 200 with { ok: true } if email is eligible (never reveals whether
 * email exists — attacker just gets "code sent").
 * Returns 400/422 for validation errors.
 * Returns 403 with a reason code if not eligible.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { findEligibleTrainingStudent } from "@/lib/mainDb";

const bodySchema = z.object({ email: z.string().email() });

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 1. Parse + validate body
  let body: { email: string };
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const email = body.email.toLowerCase().trim();

  // 2. Check eligibility against main Nakconel DB (server-side only)
  let eligibility: Awaited<ReturnType<typeof findEligibleTrainingStudent>>;
  try {
    eligibility = await findEligibleTrainingStudent(email);
  } catch {
    return NextResponse.json(
      { error: "Unable to verify eligibility. Please try again later." },
      { status: 503 }
    );
  }

  if (!eligibility.eligible) {
    const messages: Record<string, string> = {
      email_not_found:  "This email is not registered with Nakconel. Please register on the main website first.",
      not_training:     "This email is registered for an internship, not a training programme. Only training students can access the Learning Center.",
      status_blocked:   "Your registration is currently inactive. Please contact Nakconel support.",
    };
    return NextResponse.json(
      { error: messages[eligibility.reason] ?? "You are not eligible to access the Learning Center." },
      { status: 403 }
    );
  }

  // 3. Generate 6-digit OTP
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hashed = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate any previous unused codes for this email
  await prisma.learningOtp.updateMany({
    where: { email, used: false },
    data: { used: true },
  });

  // Store new OTP
  await prisma.learningOtp.create({
    data: { email, code: hashed, expiresAt },
  });

  // 4. Send email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr  = process.env.RESEND_FROM ?? "NAKCONEL Learning Center <onboarding@resend.dev>";

  if (!resendKey || resendKey.startsWith("re_your_")) {
    // Dev mode — log the code instead of sending
    console.log(`[DEV] OTP for ${email}: ${code}`);
  } else {
    const resend = new Resend(resendKey);
    const { error: sendError } = await resend.emails.send({
      from: fromAddr,
      to:   email,
      subject: "Your NAKCONEL Learning Center verification code",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem;">
          <img src="https://nakconel-cbt.vercel.app/logo.png" alt="NAKCONEL" style="height:56px;margin-bottom:1.5rem;" />
          <h1 style="color:#330808;font-size:1.5rem;margin:0 0 0.5rem;">Verification Code</h1>
          <p style="color:#4a1212;margin:0 0 1.5rem;">Use the code below to sign in to the NAKCONEL Learning Center. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#fff8f8;border:2px solid #991b1b;border-radius:12px;padding:1.5rem;text-align:center;margin:1.5rem 0;">
            <span style="font-size:2.5rem;font-weight:900;letter-spacing:0.25em;color:#330808;">${code}</span>
          </div>
          <p style="color:#9b5c5c;font-size:0.85rem;">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #fde8e8;margin:1.5rem 0;" />
          <p style="color:#c4a0a0;font-size:0.75rem;">NAKCONEL Learning Center &middot; ${eligibility.registration.program}</p>
        </div>
      `,
    });

    if (sendError) {
      console.error("[request-otp] Resend error:", sendError);
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    // Return the student's name so the frontend can personalise the next screen
    name: eligibility.registration.name.split(" ")[0],
  });
}
