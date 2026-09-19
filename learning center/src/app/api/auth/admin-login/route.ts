import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { adminLoginSchema } from "@/lib/validation";
import { createSession } from "@/lib/auth";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const rl = checkRateLimit(clientKeyFromRequest(req, "admin-login"), 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const genericError = () =>
    NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || admin.status !== "active") return genericError();

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    await prisma.auditLog.create({
      data: { actorType: "admin", actorId: admin.id, action: "admin.login_failed" },
    });
    return genericError();
  }

  await createSession({ sub: admin.id, role: "admin" });

  await prisma.auditLog.create({
    data: { actorType: "admin", actorId: admin.id, action: "admin.login" },
  });

  return NextResponse.json({ fullName: admin.fullName, email: admin.email, role: admin.role });
}
