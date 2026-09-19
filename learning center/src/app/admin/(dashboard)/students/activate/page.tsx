"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Course = { id: string; name: string };
type Result = { studentId: string; fullName: string; email: string; course: string; status: string };

export default function ActivateStudentPage() {
  const router = useRouter();
  const [courses,   setCourses]   = useState<Course[]>([]);
  const [email,     setEmail]     = useState("");
  const [fullName,  setFullName]  = useState("");
  const [courseId,  setCourseId]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<{ student: Result; created: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/auth/register")
      .then(r => r.json())
      .then(d => setCourses(d.courses ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/students/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to activate student."); return; }
      setResult(data);
      setEmail(""); setFullName(""); setCourseId("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fieldStyle = {
    display: "flex", flexDirection: "column" as const, gap: "0.35rem",
  };
  const inputStyle = {
    padding: "0.65rem 0.85rem", border: "1px solid #d8cdbf", borderRadius: 6,
    fontSize: "0.95rem", color: "var(--burgundy-900)", outline: "none",
    fontFamily: "var(--font-body)",
  };
  const labelStyle = { fontSize: "0.82rem", fontWeight: 600 as const, color: "var(--ink-600)" };

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <Link href="/admin/students" style={{ fontSize: "0.85rem", color: "var(--gold-600)", textDecoration: "none" }}>
          ← Back to Students
        </Link>
        <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", margin: "0.75rem 0 0.4rem" }}>
          Student management
        </p>
        <h1 style={{ fontSize: "1.9rem", margin: 0 }}>Activate Student Account</h1>
        <p style={{ color: "var(--ink-600)", marginTop: "0.5rem", lineHeight: 1.6 }}>
          Enter the student's name, email, and assigned course. That course controls the classes and assessments they can access when they log in with their email.
        </p>
      </div>

      {/* Success result */}
      {result && (
        <div style={{ background: "#e4f0e6", border: "1px solid var(--success)", borderRadius: 8, padding: "1.1rem 1.25rem", marginBottom: "1.5rem" }}>
          <p style={{ margin: "0 0 0.4rem", fontWeight: 700, color: "var(--success)", fontSize: "0.95rem" }}>
            {result.created ? "✓ Student account created!" : "✓ Student account updated!"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 1rem", fontSize: "0.85rem", color: "var(--ink-600)" }}>
            <span><strong>Student ID:</strong> {result.student.studentId}</span>
            <span><strong>Name:</strong> {result.student.fullName}</span>
            <span><strong>Email:</strong> {result.student.email}</span>
            <span><strong>Course:</strong> {result.student.course}</span>
            <span><strong>Status:</strong> {result.student.status}</span>
          </div>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "var(--ink-600)" }}>
            The student can now log in at <strong>/login</strong> using their email address.
          </p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.15rem", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "1.5rem" }}>

        <div style={fieldStyle}>
          <label style={labelStyle}>Email Address *</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="student@example.com" style={inputStyle} disabled={loading}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Student Name *</label>
          <input
            type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Student's full name" style={inputStyle} disabled={loading}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Assign Course *</label>
          <select
            required value={courseId} onChange={e => setCourseId(e.target.value)}
            style={{ ...inputStyle, background: "white" }} disabled={loading}
          >
            <option value="">— Select a course —</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0, padding: "0.6rem 0.8rem", background: "#fee", borderRadius: 6 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !fullName || !courseId}
          style={{
            background: loading || !email || !fullName || !courseId ? "#ccc" : "var(--gold-600)",
            color: "var(--burgundy-950)",
            border: "none", borderRadius: 6, padding: "0.75rem",
            fontWeight: 700, fontSize: "0.95rem", cursor: loading ? "wait" : "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          {loading ? "Activating…" : "Activate Student Account"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--ink-600)", lineHeight: 1.6 }}>
        <strong>Note:</strong> If the student already has an account, their course will be updated and their status will be set to active.
      </p>
    </div>
  );
}
