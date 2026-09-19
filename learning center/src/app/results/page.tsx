import { redirect } from "next/navigation";
import { getStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import LogoutButton from "@/components/LogoutButton";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const session = await getStudentSession();
  if (!session || session.role !== "student") redirect("/login");

  const student = await prisma.student.findUnique({ where: { id: session.sub } });
  if (!student || student.status !== "active") redirect("/login");

  const attempts = await prisma.examAttempt.findMany({
    where: { studentId: student.id, status: { in: ["SUBMITTED", "TIMED_OUT"] } },
    include: { exam: { select: { name: true, passingScore: true } } },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <main style={{ minHeight: "100dvh", background: "var(--cream-50)" }}>
      <header style={header}>
        <a href="/dashboard" style={brand}>Nakconel Examinations</a>
        <div style={headerActions}><a href="/dashboard" style={navLink}>Dashboard</a><RefreshButton /><LogoutButton /></div>
      </header>
      <section style={content}>
        <p style={eyebrow}>Student record</p>
        <h1>Results and history</h1>
        {attempts.length === 0 ? (
          <div style={emptyState}>You have not completed an exam yet.</div>
        ) : (
          <div style={{ display: "grid", gap: "0.8rem" }}>
            {attempts.map((attempt) => (
              <article key={attempt.id} style={resultCard}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.15rem", color: "var(--burgundy-900)" }}>{attempt.exam.name}</h2>
                  <p style={{ margin: "0.35rem 0 0", color: "var(--ink-600)", fontSize: "0.9rem" }}>
                    {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "No submission time"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <strong style={{ color: attempt.passed ? "var(--success)" : "var(--danger)", fontSize: "1.2rem" }}>{attempt.score ?? 0}%</strong>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem" }}>{attempt.status === "TIMED_OUT" ? "Timed out" : attempt.passed ? "Passed" : `Not passed (need ${attempt.exam.passingScore}%)`}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const header = { background: "var(--burgundy-900)", color: "var(--cream-50)", padding: "1.1rem 6vw", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" } as const;
const brand = { color: "inherit", fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "1.15rem", textDecoration: "none" } as const;
const headerActions = { display: "flex", alignItems: "center", gap: "1rem" } as const;
const navLink = { color: "inherit", textDecoration: "none", fontSize: "0.9rem" } as const;
const content = { padding: "5vh 6vw", maxWidth: 780, margin: "0 auto" } as const;
const eyebrow = { color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem" } as const;
const emptyState = { border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" } as const;
const resultCard = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.15rem 1.4rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" } as const;
