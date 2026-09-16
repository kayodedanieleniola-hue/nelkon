import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COURSES = [
  "Brand Strategy & Positioning",
  "Project Management for Brands",
  "Web & App Development",
  "AI Automation",
  "Content & Graphics Design",
  "Content Design (Intro Track)",
];

const DEFAULT_EXAMS = [
  { name: "Test 1", order: 1, numQuestions: 45, durationMinutes: 60 },
  { name: "Test 2", order: 2, numQuestions: 45, durationMinutes: 60 },
  { name: "Final Test", order: 3, numQuestions: 50, durationMinutes: 75 },
];

async function main() {
  for (const name of COURSES) {
    const course = await prisma.course.upsert({
      where: { name },
      create: { name },
      update: {},
    });

    const existingExams = await prisma.exam.findMany({ where: { courseId: course.id } });
    if (existingExams.length === 0) {
      await prisma.exam.createMany({
        data: DEFAULT_EXAMS.map((e) => ({ ...e, courseId: course.id })),
      });
    }
  }
  console.log(`Seeded ${COURSES.length} courses with default exams.`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.admin.upsert({
      where: { email: adminEmail.toLowerCase() },
      create: { email: adminEmail.toLowerCase(), fullName: adminName, passwordHash },
      update: {},
    });
    console.log(`Seeded admin account: ${adminEmail}`);
  } else {
    console.log(
      "No SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD set — skipped creating an admin account. " +
        "Set them as env vars and re-run `npm run db:seed` to create one."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
