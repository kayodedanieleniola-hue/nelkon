"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Course = {
  id: string;
  name: string;
  active: boolean;
  _count: { students: number; exams: number };
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/courses");
    const data = await res.json();
    if (res.ok) setCourses(data.courses ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create course");
        return;
      }
      setNewName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(course: Course) {
    await fetch(`/api/admin/courses/${course.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !course.active }),
    });
    await load();
  }

  return (
    <div>
      <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
        Course management
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "1.75rem" }}>Courses</h1>

      <form
        onSubmit={createCourse}
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "2rem",
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "1.1rem 1.25rem",
        }}
      >
        <input
          placeholder="New course name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: "1 1 220px", padding: "0.6rem 0.8rem", border: "1px solid #d8cdbf", borderRadius: 4 }}
        />
        <button
          type="submit"
          disabled={creating}
          style={{
            background: "var(--gold-600)",
            color: "var(--burgundy-950)",
            border: "none",
            padding: "0.6rem 1.2rem",
            borderRadius: 4,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {creating ? "Adding…" : "Add course"}
        </button>
      </form>

      {error && <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-600)" }}>Loading…</p>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {courses.map((c, i) => (
            <div
              key={c.id}
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
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--burgundy-900)" }}>{c.name}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-600)" }}>
                  {c._count.students} student{c._count.students === 1 ? "" : "s"} &middot;{" "}
                  {c._count.exams} exam{c._count.exams === 1 ? "" : "s"}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Link
                  href={`/admin/exams?courseId=${c.id}`}
                  style={{ fontSize: "0.85rem", color: "var(--gold-600)", fontWeight: 600, textDecoration: "none" }}
                >
                  View exams
                </Link>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.6rem",
                    borderRadius: 4,
                    background: c.active ? "#e4f0e6" : "#f2e3e0",
                    color: c.active ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {c.active ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => toggleActive(c)}
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
                  {c.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
