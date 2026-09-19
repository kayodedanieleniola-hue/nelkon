import { NextResponse } from "next/server";
import { destroyLcSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroyLcSession();
  return NextResponse.json({ ok: true });
}
