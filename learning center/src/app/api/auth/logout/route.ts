import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const role = (body as { role?: string }).role === "admin" ? "admin" : "student";

  await destroySession(role);
  return NextResponse.json({ ok: true });
}
