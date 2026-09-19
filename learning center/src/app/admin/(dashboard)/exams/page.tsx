"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { STATUS_LABEL, type ExamStatus } from "@/lib/examStatus";

type Exam = {
  id: string;
  name: string;
  numQuestions: number;
  durationMinutes: number;
  published: boolean;
  status: ExamStatus;
  course: { id: string; name: string };
};

type Course = { id: string; name: string };

function ExamsPageInner() {
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState(searchParams.get("courseId") ?? "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/register")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    fetch(`/api/admin/exams?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setExams(data.exams ?? []))
      .finally(() => setLoading(false));
  }, [courseId]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
            Exam management
          </p>
          <h1 style={{ fontSize: "1.9rem" }}>Exams</h1>
        </div>
        <Link
          href="/admin/exams/new"
          style={{
            background: "var(--gold-600)",
            color: "var(--burgundy-950)",
            padding: "0.65rem 1.1rem",
            borderRadius: 4,
            fontWeight: 600,
            fontSize: "0.9rem",
            textDecoration: "none",
          }}
        >
          + New exam
        </Link>
      </div>

      <select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        style={{ padding: "0.6rem 0.8rem", border: "1px solid #d8cdbf", borderRadius: 4, marginBottom: "1.5rem" }}
      >
        <option value="">All courses</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {loading ? (
        <p style={{ color: "var(--ink-600)" }}>Loading…</p>
      ) : exams.length === 0 ? (
        <div style={{ border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" }}>
          No exams yet for this selection.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {exams.map((exam, i) => (
            <Link
              key={exam.id}
              href={`/admin/exams/${exam.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.9rem 1.25rem",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                flexWrap: "wrap",
                gap: "0.6rem",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--burgundy-900)" }}>{exam.name}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-600)" }}>
                  {exam.course.name} &middot; {exam.numQuestions} questions &middot; {exam.durationMinutes} min
                </p>
              </div>
              <StatusBadge status={exam.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
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
    <span style={{ background: c.bg, color: c.fg, padding: "0.3rem 0.65rem", borderRadius: 4, fontSize: "0.8rem", fontWeight: 600 }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function AdminExamsPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--ink-600)" }}>Loading…</p>}>
      <ExamsPageInner />
    </Suspense>
  );
}
