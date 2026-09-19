"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { label, input, fieldGroup, submitButton, errorText } from "@/components/formStyles";

type Course = { id: string; name: string };

function NewExamInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    courseId: searchParams.get("courseId") ?? "",
    name: "",
    order: "1",
    numQuestions: "45",
    durationMinutes: "60",
    passingScore: "50",
    instructions: "",
    shuffleQuestions: true,
    shuffleOptions: true,
  });

  useEffect(() => {
    fetch("/api/auth/register")
      .then((res) => res.json())
      .then((data) => setCourses(data.courses ?? []));
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          order: Number(form.order),
          numQuestions: Number(form.numQuestions),
          durationMinutes: Number(form.durationMinutes),
          passingScore: Number(form.passingScore),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create exam");
        return;
      }
      router.push(`/admin/exams/${data.exam.id}`);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
        New exam
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "1.75rem" }}>Create an exam</h1>

      <form
        onSubmit={handleSubmit}
        style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.75rem" }}
      >
        {error && <p style={errorText}>{error}</p>}

        <div style={fieldGroup}>
          <label style={label} htmlFor="courseId">Course</label>
          <select
            style={input}
            id="courseId"
            required
            value={form.courseId}
            onChange={(e) => update("courseId", e.target.value)}
          >
            <option value="" disabled>Select a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={fieldGroup}>
          <label style={label} htmlFor="name">Exam name</label>
          <input
            style={input}
            id="name"
            required
            placeholder="e.g. Test 1, Final Test"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "0.8rem" }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="numQuestions">Number of questions</label>
            <input
              style={input}
              id="numQuestions"
              type="number"
              min={1}
              required
              value={form.numQuestions}
              onChange={(e) => update("numQuestions", e.target.value)}
            />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="durationMinutes">Duration (minutes)</label>
            <input
              style={input}
              id="durationMinutes"
              type="number"
              min={1}
              required
              value={form.durationMinutes}
              onChange={(e) => update("durationMinutes", e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.8rem" }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="passingScore">Passing score (%)</label>
            <input
              style={input}
              id="passingScore"
              type="number"
              min={0}
              max={100}
              required
              value={form.passingScore}
              onChange={(e) => update("passingScore", e.target.value)}
            />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="order">Display order</label>
            <input
              style={input}
              id="order"
              type="number"
              min={0}
              value={form.order}
              onChange={(e) => update("order", e.target.value)}
            />
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={label} htmlFor="instructions">Instructions (optional)</label>
          <textarea
            id="instructions"
            rows={3}
            style={{ ...input, resize: "vertical" as const }}
            value={form.instructions}
            onChange={(e) => update("instructions", e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={form.shuffleQuestions}
              onChange={(e) => update("shuffleQuestions", e.target.checked)}
            />
            Shuffle questions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={form.shuffleOptions}
              onChange={(e) => update("shuffleOptions", e.target.checked)}
            />
            Shuffle answer options
          </label>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--ink-600)", marginBottom: "1.25rem" }}>
          The exam is created unpublished, with no schedule. You'll set dates and publish it from
          its detail page next.
        </p>

        <button style={submitButton} type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create exam"}
        </button>
      </form>
    </div>
  );
}

export default function NewExamPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--ink-600)" }}>Loading…</p>}>
      <NewExamInner />
    </Suspense>
  );
}
