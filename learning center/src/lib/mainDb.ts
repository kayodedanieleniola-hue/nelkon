/**
 * mainDb — read-only connection to the central Nakconel main website
 * Neon database. Used ONLY for student eligibility checks.
 *
 * We use raw SQL via PrismaClient with a custom datasource URL so we
 * don't need a separate schema file. All queries here are SELECT-only.
 *
 * The main DB schema (career_registrations table):
 *   id, type, name, email, phone, program, experience_level,
 *   statement, details, amount, status, payment_reference,
 *   paid_at, created_at, updated_at
 *
 * Eligibility rules:
 *   - type = 'TRAINING'   (not INTERNSHIP)
 *   - status NOT IN ('Cancelled','Rejected','Suspended')
 */

import { PrismaClient } from "@prisma/client";

// Eligible statuses — anything that is NOT one of these blocked statuses
const BLOCKED_STATUSES = ["Cancelled", "Rejected", "Suspended"];

// Singleton pattern (same as src/lib/db.ts)
const globalForMainDb = globalThis as unknown as { mainPrisma?: PrismaClient };

export const mainPrisma =
  globalForMainDb.mainPrisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.MAIN_DATABASE_URL!,
      },
    },
    log: [],
  });

if (process.env.NODE_ENV !== "production") globalForMainDb.mainPrisma = mainPrisma;

// ── Types ──────────────────────────────────────────────────────────────────────

export type MainRegistration = {
  id: string;
  type: string;
  name: string;
  email: string;
  phone: string;
  program: string;
  status: string;
  payment_reference: string | null;
  paid_at: string | null;
  created_at: string;
};

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Look up a student by email in the main Nakconel database.
 * Returns the registration record if the student:
 *   1. Has a TRAINING registration (not internship)
 *   2. Has a non-blocked status
 * Returns null if not found or not eligible.
 */
export async function findEligibleTrainingStudent(
  email: string
): Promise<{ eligible: true; registration: MainRegistration } | { eligible: false; reason: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  let rows: MainRegistration[];
  try {
    rows = await mainPrisma.$queryRaw`
      SELECT id, type, name, email, phone, program, status,
             payment_reference, paid_at, created_at
      FROM   career_registrations
      WHERE  LOWER(email) = ${normalizedEmail}
      ORDER  BY created_at DESC
      LIMIT  10
    `;
  } catch (err) {
    console.error("[mainDb] query error:", err);
    throw new Error("Unable to verify eligibility. Please try again.");
  }

  if (!rows || rows.length === 0) {
    return { eligible: false, reason: "email_not_found" };
  }

  // Prefer a TRAINING row
  const trainingRows = rows.filter(
    (r) => (r.type ?? "").toUpperCase() === "TRAINING"
  );

  if (trainingRows.length === 0) {
    return { eligible: false, reason: "not_training" };
  }

  // Find one with a non-blocked status
  const activeRow = trainingRows.find(
    (r) => !BLOCKED_STATUSES.includes(r.status ?? "")
  );

  if (!activeRow) {
    return { eligible: false, reason: "status_blocked" };
  }

  return { eligible: true, registration: activeRow };
}
