import { prisma } from "@/lib/db";

/**
 * Generates the next Student ID for the given year, e.g. NAK-2026-001.
 *
 * Uses a single atomic upsert (INSERT ... ON CONFLICT DO UPDATE) against
 * StudentIdCounter, so concurrent registrations in the same year can never
 * be handed the same number — Postgres serializes the row-level update.
 */
export async function generateStudentId(year: number = new Date().getFullYear()): Promise<string> {
  const counter = await prisma.studentIdCounter.upsert({
    where: { year },
    create: { year, count: 1 },
    update: { count: { increment: 1 } },
  });

  const sequence = String(counter.count).padStart(3, "0");
  return `NAK-${year}-${sequence}`;
}
