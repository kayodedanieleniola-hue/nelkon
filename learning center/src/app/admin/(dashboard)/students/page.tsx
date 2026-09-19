"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Student = {
  id: string;
  studentId: string;
  fullName: string;
  email: string;
  phone: string;
  status: string;
  createdAt: string;
  course: { id: string; name: string };
};

type Course = { id: string; name: string };

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [q, setQ] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/register")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (courseId) params.set("courseId", courseId);
      if (status) params.set("status", status);

      const res = await fetch(`/api/admin/students?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load students.");
        return;
      }
      setStudents(data.students ?? []);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, [q, courseId, status]);

  useEffect(() => {
    const t = setTimeout(load, 300); // debounce search typing
    return () => clearTimeout(t);
  }, [load]);

  async function toggleStatus(student: Student) {
    const next = student.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, status: next } : s)));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
            Student management
          </p>
          <h1 style={{ fontSize: "1.9rem" }}>Students</h1>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link
            href="/admin/students/activate"
            style={{
              background: "var(--burgundy-900)",
              color: "#fff",
              padding: "0.65rem 1.1rem",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            + Activate Student
          </Link>
          <a
            href="/api/admin/students/export"
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
            Export to Excel
          </a>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <input
          placeholder="Search name, email, Student ID, phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 240px", padding: "0.6rem 0.8rem", border: "1px solid #d8cdbf", borderRadius: 4 }}
        />
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          style={{ padding: "0.6rem 0.8rem", border: "1px solid #d8cdbf", borderRadius: 4 }}
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "0.6rem 0.8rem", border: "1px solid #d8cdbf", borderRadius: 4 }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-600)" }}>Loading…</p>
      ) : students.length === 0 ? (
        <div style={{ border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" }}>
          No students match this search.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {students.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.9rem 1.25rem",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                flexWrap: "wrap",
                gap: "0.6rem",
              }}
            >
              <Link href={`/admin/students/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--burgundy-900)" }}>{s.fullName}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-600)" }}>
                  {s.studentId} &middot; {s.course.name} &middot; {s.email}
                </p>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.6rem",
                    borderRadius: 4,
                    background: s.status === "active" ? "#e4f0e6" : "#f2e3e0",
                    color: s.status === "active" ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {s.status === "active" ? "Active" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleStatus(s)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--gold-400)",
                    color: "var(--burgundy-900)",
                    padding: "0.35rem 0.7rem",
                    borderRadius: 4,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                  }}
                >
                  {s.status === "active" ? "Disable" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
