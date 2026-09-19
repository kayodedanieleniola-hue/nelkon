import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getExamStatus, STATUS_LABEL } from "@/lib/examStatus";
import StatusToggleButton from "./StatusToggleButton";
import DeleteVerificationButton from "./DeleteVerificationButton";
import DeleteStudentButton from "./DeleteStudentButton";

export const dynamic = "force-dynamic";

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      course: {
        include: { exams: { orderBy: { order: "asc" } } },
      },
      attempts: {
        include: { exam: { select: { name: true, passingScore: true } } },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!student) notFound();

  const now = new Date();
  const attemptedExamIds = new Set(student.attempts.map((a) => a.examId));
  const notYetAttempted = student.course.exams.filter((e) => !attemptedExamIds.has(e.id));

  return (
    <div>
      <Link href="/admin/students" style={{ color: "var(--ink-600)", fontSize: "0.9rem", textDecoration: "none" }}>
        ← All students
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", margin: "1rem 0 2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.3rem" }}>{student.fullName}</h1>
          <p style={{ color: "var(--ink-600)" }}>{student.studentId} &middot; {student.course.name}</p>
        </div>
        <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
          <StatusToggleButton studentDbId={student.id} status={student.status} />
          <DeleteStudentButton studentDbId={student.id} studentName={student.fullName} />
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <Field label="Email" value={student.email} />
        <Field label="Phone" value={student.phone} />
        <Field label="Age" value={String(student.age)} />
        <Field label="Gender" value={student.gender} />
        <Field label="Address" value={student.address} />
        <Field label="Social media" value={student.socialMedia || "—"} />
        <Field label="Registered" value={student.createdAt.toLocaleDateString()} />
        <Field label="Status" value={student.status === "active" ? "Active" : "Disabled"} />
      </div>

      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Identity verification</h2>
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.25rem", marginBottom: "2rem", display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
        {student.verificationPhoto ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={student.verificationPhoto}
              alt=""
              width={80}
              height={60}
              style={{ borderRadius: 4, objectFit: "cover", border: "1px solid var(--line)" }}
            />
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ margin: 0, color: "var(--burgundy-900)", fontWeight: 600 }}>Enrolled</p>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--ink-600)" }}>
                Captured {student.verificationCapturedAt?.toLocaleString()} — used to verify identity on every exam attempt since.
              </p>
            </div>
            <DeleteVerificationButton studentDbId={student.id} />
          </>
        ) : (
          <p style={{ margin: 0, color: "var(--ink-600)", fontSize: "0.9rem" }}>
            No verification data yet — this is captured automatically (with consent) the first time this student sits an exam.
          </p>
        )}
      </div>

      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Exam activity</h2>
      {student.course.exams.length === 0 ? (
        <div style={{ border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" }}>
          No exams configured for this course yet.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {student.attempts.map((attempt, i) => (
            <div
              key={attempt.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.85rem 1.25rem",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span>{attempt.exam.name}</span>
              <span style={{ fontSize: "0.88rem" }}>
                {attempt.status === "IN_PROGRESS" ? (
                  <span style={{ color: "var(--gold-600)" }}>In progress</span>
                ) : (
                  <>
                    <strong style={{ color: attempt.passed ? "var(--success)" : "var(--danger)" }}>{attempt.score}%</strong>
                    <span style={{ color: "var(--ink-600)" }}> · {attempt.status === "TIMED_OUT" ? "Timed out" : attempt.passed ? "Passed" : "Not passed"}</span>
                  </>
                )}
              </span>
            </div>
          ))}
          {notYetAttempted.map((exam, i) => (
            <div
              key={exam.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.85rem 1.25rem",
                borderTop: i === 0 && student.attempts.length === 0 ? "none" : "1px solid var(--line)",
              }}
            >
              <span>{exam.name}</span>
              <span style={{ color: "var(--ink-600)", fontSize: "0.88rem" }}>
                {STATUS_LABEL[getExamStatus(exam, now)]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: "0.8rem", color: "var(--ink-600)", marginBottom: "0.2rem" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--burgundy-900)", margin: 0 }}>{value}</p>
    </div>
  );
}
