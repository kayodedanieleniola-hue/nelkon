/**
 * TEMPORARY diagnostic route — DELETE after use.
 * Tests all three candidate main DB URLs to find which one
 * contains the career_registrations data.
 * Protected by SETUP_SECRET so it's not publicly accessible.
 */
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

async function probe(label: string, url: string) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables: any[] = await p.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    );
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const c: any[] = await p.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${t.table_name}"`);
      counts[t.table_name] = Number(c[0].n);
    }
    const sample: any[] = (await p.$queryRawUnsafe(
      `SELECT id, type, name, email, status FROM career_registrations LIMIT 3`
    ).catch(() => [])) as any[];
    return { label, ok: true, counts, sample };
  } catch (e: any) {
    return { label, ok: false, error: e.message.split("\n")[0] };
  } finally {
    await p.$disconnect();
  }
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await Promise.all([
    probe("curly-frost",
      "postgresql://neondb_owner:npg_i4vOaQzptS7c@ep-curly-frost-aurfkwbr.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require"),
    probe("royal-sky-pooler",
      "postgresql://neondb_owner:npg_RLafheKp1x2q@ep-royal-sky-aua172o4-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require"),
    probe("royal-sky-direct",
      "postgresql://neondb_owner:npg_RLafheKp1x2q@ep-royal-sky-aua172o4.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require"),
    probe("winter-butterfly",
      "postgresql://neondb_owner:npg_H4KjzG2lTJCX@ep-winter-butterfly-axgm2a6v.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require"),
  ]);

  return NextResponse.json(results, { status: 200 });
}
