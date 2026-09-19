import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";
import RefreshButton from "@/components/RefreshButton";
import { getExamStatus, STATUS_LABEL, type ExamStatus } from "@/lib/examStatus";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getStudentSession();
  if (!session || session.role !== "student") {
    redirect("/login");
  }

  const student = await prisma.student.findUnique({
    where: { id: session.sub },
    include: {
      course: {
        include: {
          exams: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!student || student.status !== "active") {
    redirect("/login");
  }

  const now = new Date();
  const exams = student.course.exams.map((exam) => ({
    ...exam,
    status: getExamStatus(exam, now),
  }));

  return (
    <main style={{ minHeight: "100dvh", background: "var(--cream-50)" }}>
      <header
        style={{
          background: "var(--burgundy-900)",
          color: "var(--cream-50)",
          padding: "1.1rem 6vw",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <img src="/logo.png" alt="NAKCONEL" style={{ width: 38, height: 38, objectFit: "contain" }} />
          <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.15rem" }}>
            Nakconel Examinations
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <a href="/learning" style={{ color: "inherit", textDecoration: "none", fontSize: "0.9rem" }}>My Course</a>
          <a href="/results" style={{ color: "inherit", textDecoration: "none", fontSize: "0.9rem" }}>Results</a>
          <RefreshButton />
          <LogoutButton />
        </div>
      </header>

      <section style={{ padding: "5vh 6vw", maxWidth: 780 }}>
        <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
          Welcome back
        </p>
        <h1 style={{ fontSize: "2rem", marginBottom: "1.75rem" }}>{student.fullName}</h1>

        <div
          style={{
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.25rem",
            marginBottom: "2.5rem",
          }}
        >
          <div>
            <p style={fieldLabel}>Student ID</p>
            <p style={fieldValue}>{student.studentId}</p>
          </div>
          <div>
            <p style={fieldLabel}>Enrolled course</p>
            <p style={fieldValue}>{student.course.name}</p>
          </div>
          <div>
            <p style={fieldLabel}>Email</p>
            <p style={fieldValue}>{student.email}</p>
          </div>
        </div>

        <h2 style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>
          {student.course.name.toUpperCase()}
        </h2>

        {exams.length === 0 ? (
          <div style={emptyState}>
            No assessments have been set up for this course yet.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "0.9rem" }}>
            {exams.map((exam) => (
              <div key={exam.id} style={examCard}>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", margin: "0 0 0.35rem", color: "var(--burgundy-900)" }}>
                    {exam.name}
                  </p>
                  <p style={{ color: "var(--ink-600)", fontSize: "0.9rem", margin: 0 }}>
                    {exam.numQuestions} Questions &middot; Duration: {exam.durationMinutes} Minutes
                  </p>
                </div>
                {exam.status === "ONGOING" ? (
                  <a href={`/exam/${exam.id}`} style={startButton}>Start exam</a>
                ) : (
                  <StatusBadge status={exam.status} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: ExamStatus }) {
  const colors: Record<ExamStatus, { bg: string; fg: string }> = {
    NOT_CONFIGURED: { bg: "#efe9e0", fg: "var(--ink-600)" },
    UPCOMING: { bg: "#f1e2c2", fg: "var(--gold-600)" },
    ONGOING: { bg: "#e4f0e6", fg: "var(--success)" },
    CLOSED: { bg: "#f2e3e0", fg: "var(--danger)" },
  };
  const c = colors[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "0.35rem 0.75rem",
        borderRadius: 4,
        fontSize: "0.82rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
        alignSelf: "center",
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const fieldLabel = { fontSize: "0.8rem", color: "var(--ink-600)", marginBottom: "0.2rem" };
const fieldValue = { fontFamily: "var(--font-display)", fontSize: "1.15rem", color: "var(--burgundy-900)", margin: 0 };

const emptyState = {
  border: "1px dashed var(--gold-400)",
  borderRadius: 6,
  padding: "1.5rem",
  color: "var(--ink-600)",
} as const;

const examCard = {
  background: "#fff",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "1.15rem 1.4rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
} as const;

const startButton = {
  background: "var(--burgundy-900)",
  color: "#fff",
  padding: "0.55rem 0.8rem",
  borderRadius: 4,
  fontSize: "0.82rem",
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
} as const;
