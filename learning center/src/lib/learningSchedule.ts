import { prisma } from "@/lib/db";

/** Promotes scheduled classes to live, then live classes to completed, using
 * server time. Draft and cancelled classes are never changed automatically. */
export async function syncLearningClassStatuses(now = new Date()) {
  await prisma.learningClass.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, data: { status: "LIVE" } });
  await prisma.learningClass.updateMany({ where: { status: "LIVE", endsAt: { lte: now } }, data: { status: "COMPLETED" } });
}
