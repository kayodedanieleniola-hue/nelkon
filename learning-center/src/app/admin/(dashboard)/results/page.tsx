"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Result = {
  id: string;
  student: { studentId: string; fullName: string; email: string };
  course: string;
  exam: string;
  score: number;
  passingScore: number;
  passed: boolean;
  status: string;
  submittedAt: string | null;
};

type Course = { id: string; name: string };
type Exam = { id: string; name: string; course: { id: string } };

export default function AdminResultsPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [examId, setExamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/results")
      .then((response) => response.json())
      .then((data) => setResults(data.results ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/auth/register").then((r) => r.json()).then((d) => setCourses(d.courses ?? []));
    fetch("/api/admin/exams").then((r) => r.json()).then((d) => setExams(d.exams ?? []));
  }, [load]);

  async function resetAttempt(result: Result) {
    if (
      !confirm(
        `Reset ${result.student.fullName}'s attempt on "${result.exam}"? This deletes their submission and lets them start over.`
      )
    ) {
      return;
    }
    setResettingId(result.id);
    const res = await fetch(`/api/admin/attempts/${result.id}`, { method: "DELETE" });
    if (res.ok) {
      setResults((prev) => prev.filter((r) => r.id !== result.id));
    } else {
      alert("Couldn't reset this attempt. Try again.");
    }
    setResettingId(null);
  }

  const visibleExams = courseId ? exams.filter((e) => e.course.id === courseId) : exams;

  const visible = results
    .filter((result) => {
      const value = `${result.student.studentId} ${result.student.fullName} ${result.student.email} ${result.course} ${result.exam}`.toLowerCase();
      return value.includes(search.toLowerCase().trim());
    })
    .filter((result) => (courseId ? courses.some((c) => c.id === courseId && c.name === result.course) : true))
    .filter((result) => {
      if (!examId) return true;
      const exam = exams.find((e) => e.id === examId);
      return exam ? result.exam === exam.name : true;
    });

  const scored = visible.filter((r) => r.status !== "TERMINATED");
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length) : null;
  const passRate = scored.length > 0 ? Math.round((scored.filter((r) => r.passed).length / scored.length) * 100) : null;

  const exportUrl = `/api/admin/results/export${courseId || examId ? `?${new URLSearchParams({ ...(courseId ? { courseId } : {}), ...(examId ? { examId } : {}) }).toString()}` : ""}`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <p style={eyebrow}>Admin report</p>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.5rem" }}>Exam results</h1>
          <p style={muted}>Completed submissions and automatic scores.</p>
        </div>
        <a href={exportUrl} style={exportBtn}>Export to Excel</a>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "1.25rem 0" }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, course, or test" style={{ ...input, margin: 0, flex: "1 1 240px" }} />
        <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setExamId(""); }} style={selectStyle}>
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={examId} onChange={(e) => setExamId(e.target.value)} style={selectStyle}>
          <option value="">All exams</option>
          {visibleExams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {!loading && visible.length > 0 && (
        <div style={statsRow}>
          <StatChip label="Results shown" value={String(visible.length)} />
          <StatChip label="Average score" value={avgScore !== null ? `${avgScore}%` : "—"} />
          <StatChip label="Pass rate" value={passRate !== null ? `${passRate}%` : "—"} />
        </div>
      )}

      {loading ? <p style={muted}>Loading...</p> : visible.length === 0 ? <p style={empty}>No results match this search.</p> : (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={cell}>Student</th>
                <th style={cell}>Course / Test</th>
                <th style={cell}>Score</th>
                <th style={cell}>Status</th>
                <th style={cell}>Submitted</th>
                <th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((result) => (
                <tr key={result.id}>
                  <td style={cell}>
                    <Link href={`/admin/results/${result.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <strong>{result.student.fullName}</strong><br /><span style={small}>{result.student.studentId} · {result.student.email}</span>
                    </Link>
                  </td>
                  <td style={cell}>{result.course}<br /><span style={small}>{result.exam}</span></td>
                  <td style={cell}><strong>{result.status === "TERMINATED" ? "—" : `${result.score}%`}</strong><br /><span style={small}>Pass: {result.passingScore}%</span></td>
                  <td style={{ ...cell, color: result.passed ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                    {result.status === "TERMINATED" ? "Terminated" : result.status === "TIMED_OUT" ? "Timed out" : result.passed ? "Passed" : "Not passed"}
                  </td>
                  <td style={cell}>{result.submittedAt ? new Date(result.submittedAt).toLocaleString() : "-"}</td>
                  <td style={cell}>
                    <button
                      onClick={() => resetAttempt(result)}
                      disabled={resettingId === result.id}
                      style={resetBtn}
                    >
                      {resettingId === result.id ? "Resetting…" : "Reset attempt"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={statChip}>
      <p style={{ margin: "0 0 0.15rem", fontSize: "0.78rem", color: "var(--ink-600)" }}>{label}</p>
      <p style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--burgundy-900)" }}>{value}</p>
    </div>
  );
}

const eyebrow = { color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem" } as const;
const muted = { color: "var(--ink-600)", fontSize: "0.9rem" } as const;
const input = { width: "100%", maxWidth: 520, border: "1px solid var(--line)", borderRadius: 4, padding: "0.7rem 0.75rem" } as const;
const selectStyle = { border: "1px solid var(--line)", borderRadius: 4, padding: "0.7rem 0.75rem" } as const;
const empty = { border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" } as const;
const tableWrap = { overflowX: "auto", background: "#fff", border: "1px solid var(--line)", borderRadius: 6 } as const;
const table = { width: "100%", minWidth: 780, borderCollapse: "collapse" } as const;
const cell = { padding: "0.85rem 1rem", borderBottom: "1px solid var(--line)", textAlign: "left", fontSize: "0.88rem" } as const;
const small = { color: "var(--ink-600)", fontSize: "0.78rem" } as const;
const statsRow = { display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" } as const;
const statChip = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "0.75rem 1.1rem" } as const;
const exportBtn = {
  background: "var(--gold-600)",
  color: "var(--burgundy-950)",
  padding: "0.6rem 1rem",
  borderRadius: 4,
  fontWeight: 600,
  fontSize: "0.88rem",
  textDecoration: "none",
} as const;
const resetBtn = {
  background: "transparent",
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  padding: "0.35rem 0.7rem",
  borderRadius: 4,
  fontSize: "0.8rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;
