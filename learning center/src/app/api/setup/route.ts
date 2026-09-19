import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

// Same reasoning as the course-list route: never let this get statically cached.
export const dynamic = "force-dynamic";


const COURSES = [
  "Brand Strategy & Positioning",
  "Project Management for Brands",
  "Web & App Development",
  "AI Automation",
  "Content & Graphics Design",
  "Content Design (Intro Track)",
];

// Default assessment structure per the spec — admins can rename, reconfigure,
// or add more once the exam management screens exist. These are created
// UNPUBLISHED with no schedule, so they correctly show as "Not configured"
// on the student dashboard until an admin sets dates and publishes them.
const DEFAULT_EXAMS = [
  { name: "Test 1", order: 1, numQuestions: 45, durationMinutes: 60 },
  { name: "Test 2", order: 2, numQuestions: 45, durationMinutes: 60 },
  { name: "Final Test", order: 3, numQuestions: 50, durationMinutes: 75 },
];

// Visit this URL once after your first deploy, from any browser:
//   https://YOUR-APP.vercel.app/api/setup?key=YOUR_SETUP_SECRET
//
// It creates the 6 courses and their default Test 1 / Test 2 / Final Test
// rows (safe to run more than once — it won't duplicate them), and if
// SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD are set in your Vercel environment
// variables, creates that admin account too.
export async function GET(req: Request) {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET is not set in your environment variables." },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key !== setupSecret) {
    return NextResponse.json({ error: "Invalid or missing key." }, { status: 401 });
  }

  const results: string[] = [];

  for (const name of COURSES) {
    const course = await prisma.course.upsert({ where: { name }, create: { name }, update: {} });

    const existingExams = await prisma.exam.findMany({ where: { courseId: course.id } });
    if (existingExams.length === 0) {
      await prisma.exam.createMany({
        data: DEFAULT_EXAMS.map((e) => ({ ...e, courseId: course.id })),
      });
    }
  }
  results.push(`Courses ready: ${COURSES.join(", ")}`);
  results.push("Each course has default Test 1 / Test 2 / Final Test rows (unpublished until configured).");

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (adminEmail && adminPassword) {
    const passwordHash = await hashPassword(adminPassword);
    await prisma.admin.upsert({
      where: { email: adminEmail.toLowerCase() },
      create: { email: adminEmail.toLowerCase(), fullName: adminName, passwordHash },
      update: {},
    });
    results.push(`Admin account ready: ${adminEmail}`);
  } else {
    results.push(
      "No admin created — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in Vercel, then visit this URL again."
    );
  }

  return NextResponse.json({ ok: true, results });
}
