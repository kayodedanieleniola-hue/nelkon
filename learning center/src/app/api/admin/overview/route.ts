import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getOverviewStats } from "@/lib/adminStats";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const stats = await getOverviewStats();
  return NextResponse.json(stats);
}

