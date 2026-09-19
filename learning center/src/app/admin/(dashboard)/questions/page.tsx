"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { label, input, fieldGroup, submitButton, errorText, helpText } from "@/components/formStyles";
import BulkQuestionImport from "@/components/BulkQuestionImport";

type Course = { id: string; name: string };
type Exam = { id: string; courseId: string; name: string };
type Question = {
  id: string;
  courseId: string;
  examId: string | null;
  text: string;
  options: string[];
  correctIndex: number;
  active: boolean;
  course: { id: string; name: string };
  exam: { id: string; name: string } | null;
};

const EMPTY_OPTIONS = ["", "", "", ""];

function emptyForm(courseId: string) {
  return { courseId, examId: "", text: "", options: [...EMPTY_OPTIONS], correctIndex: 0, active: true };
}

export default function QuestionBankPage() {
  const searchParams = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState(searchParams.get("courseId") ?? "");
  const [filterExam, setFilterExam] = useState(searchParams.get("examId") ?? "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm(""));

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCourse) params.set("courseId", filterCourse);
    if (filterExam) params.set("examId", filterExam);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/admin/questions?${params.toString()}`);
    const data = await res.json();
    if (res.ok) setQuestions(data.questions ?? []);
    setLoading(false);
  }, [filterCourse, filterExam, search]);

  const courseExams = exams.filter((exam) => exam.courseId === form.courseId);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/courses");
      const data = await res.json();
      if (res.ok) {
        setCourses(data.courses ?? []);
        setForm((f) => (f.courseId ? f : { ...f, courseId: filterCourse || data.courses?.[0]?.id || "" }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!form.courseId) {
      setExams([]);
      return;
    }
    fetch(`/api/admin/exams?courseId=${encodeURIComponent(form.courseId)}`)
      .then((res) => res.json())
      .then((data) => setExams(data.exams ?? []));
  }, [form.courseId]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateOption(i: number, value: string) {
    setForm((prev) => {
      const options = [...prev.options];
      options[i] = value;
      return { ...prev, options };
    });
  }

  function addOption() {
    setForm((prev) => ({ ...prev, options: [...prev.options, ""] }));
  }

  function removeOption(i: number) {
    setForm((prev) => {
      const options = prev.options.filter((_, idx) => idx !== i);
      const correctIndex = prev.correctIndex >= options.length ? 0 : prev.correctIndex === i ? 0 : prev.correctIndex > i ? prev.correctIndex - 1 : prev.correctIndex;
      return { ...prev, options, correctIndex };
    });
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setForm({ courseId: q.courseId, text: q.text, options: [...q.options], correctIndex: q.correctIndex, active: q.active, examId: q.examId ?? "" });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...emptyForm(filterCourse || courses[0]?.id || ""), examId: "" });
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedOptions = form.options.map((o) => o.trim());
    if (!form.courseId) {
      setError("Choose a course");
      return;
    }
    if (!form.examId) {
      setError("Choose Test 1, Test 2, or Final Test");
      return;
    }
    if (!form.text.trim()) {
      setError("Enter the question text");
      return;
    }
    if (trimmedOptions.filter(Boolean).length < 2 || trimmedOptions.some((o) => !o)) {
      setError("Fill in at least 2 answer options (no blanks)");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        courseId: form.courseId,
        examId: form.examId,
        text: form.text.trim(),
        options: trimmedOptions,
        correctIndex: form.correctIndex,
        active: form.active,
      };
      const res = editingId
        ? await fetch(`/api/admin/questions/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save this question");
        return;
      }
      cancelEdit();
      await loadQuestions();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(q: Question) {
    await fetch(`/api/admin/questions/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !q.active }),
    });
    await loadQuestions();
  }

  async function deleteQuestion(q: Question) {
    if (!confirm("Delete this question? This cannot be undone.")) return;
    await fetch(`/api/admin/questions/${q.id}`, { method: "DELETE" });
    if (editingId === q.id) cancelEdit();
    await loadQuestions();
  }

  const courseCounts = new Map<string, number>();
  for (const q of questions) {
    if (q.active) courseCounts.set(q.courseId, (courseCounts.get(q.courseId) ?? 0) + 1);
  }

  return (
    <div>
      <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
        Question Bank
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "1.75rem" }}>Questions</h1>

      <BulkQuestionImport courseId={form.courseId} exams={courseExams} onImported={loadQuestions} />

      <form
        onSubmit={submit}
        style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.5rem", marginBottom: "2rem" }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>{editingId ? "Edit question" : "Add a question"}</h2>
        {error && <p style={errorText}>{error}</p>}

        <div style={fieldGroup}>
          <label style={label} htmlFor="course">Course</label>
          <select id="course" style={input} value={form.courseId} onChange={(e) => setForm((prev) => ({ ...prev, courseId: e.target.value, examId: "" }))}>
            {courses.length === 0 && <option value="">No courses yet</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={fieldGroup}>
          <label style={label} htmlFor="exam">Test</label>
          <select id="exam" style={input} value={form.examId} onChange={(e) => updateForm("examId", e.target.value)} disabled={courseExams.length === 0}>
            <option value="">Select a test</option>
            {courseExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
          </select>
          {form.courseId && courseExams.length === 0 && <p style={helpText}>Create Test 1, Test 2, or Final Test for this course first.</p>}
        </div>

        <div style={fieldGroup}>
          <label style={label} htmlFor="text">Question text</label>
          <textarea
            id="text"
            rows={2}
            style={{ ...input, resize: "vertical" as const }}
            value={form.text}
            onChange={(e) => updateForm("text", e.target.value)}
          />
        </div>

        <div style={fieldGroup}>
          <label style={label}>Answer options — select the correct one</label>
          {form.options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
              <input
                type="radio"
                name="correctIndex"
                checked={form.correctIndex === i}
                onChange={() => updateForm("correctIndex", i)}
                title="Mark as correct answer"
              />
              <input
                style={{ ...input, flex: 1 }}
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
              />
              {form.options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} style={smallDangerBtn}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addOption} style={smallGhostBtn}>
            + Add option
          </button>
          <p style={helpText}>Click the radio button next to the correct answer.</p>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", marginBottom: "1.25rem" }}>
          <input type="checkbox" checked={form.active} onChange={(e) => updateForm("active", e.target.checked)} />
          Active (counts toward an exam's ready-to-publish total)
        </label>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" disabled={busy || !form.courseId} style={{ ...submitButton, width: "auto", flex: "1 1 160px" }}>
            {busy ? "Saving…" : editingId ? "Save changes" : "Add question"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} style={smallGhostBtn}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <select style={{ ...input, width: "auto" }} value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {courseCounts.get(c.id) ? `(${courseCounts.get(c.id)} active)` : ""}
            </option>
          ))}
        </select>
        <select style={{ ...input, width: "auto" }} value={filterExam} onChange={(e) => setFilterExam(e.target.value)}>
          <option value="">All tests</option>
          {exams.filter((exam) => !filterCourse || exam.courseId === filterCourse).map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
        </select>
        <input
          style={{ ...input, flex: "1 1 220px" }}
          placeholder="Search question text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p style={{ color: "var(--ink-600)" }}>Loading…</p>
      ) : questions.length === 0 ? (
        <p style={{ color: "var(--ink-600)" }}>No questions yet.</p>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {questions.map((q, i) => (
            <div
              key={q.id}
              style={{
                padding: "1rem 1.25rem",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 320px" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--gold-600)", fontWeight: 600 }}>{q.course.name} {q.exam ? ` / ${q.exam.name}` : " / Unassigned"}</p>
                <p style={{ margin: "0.2rem 0 0.4rem", fontWeight: 600, color: "var(--ink-900)" }}>{q.text}</p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem", color: "var(--ink-600)" }}>
                  {q.options.map((o, idx) => (
                    <li key={idx} style={{ color: idx === q.correctIndex ? "var(--success)" : "var(--ink-600)", fontWeight: idx === q.correctIndex ? 600 : 400 }}>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.6rem",
                    borderRadius: 4,
                    background: q.active ? "#e4f0e6" : "#f2e3e0",
                    color: q.active ? "var(--success)" : "var(--danger)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.active ? "Active" : "Inactive"}
                </span>
                <button onClick={() => toggleActive(q)} style={smallGhostBtn}>
                  {q.active ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => startEdit(q)} style={smallGhostBtn}>
                  Edit
                </button>
                <button onClick={() => deleteQuestion(q)} style={smallDangerBtn}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const smallGhostBtn = {
  background: "transparent",
  border: "1px solid var(--gold-400)",
  color: "var(--burgundy-900)",
  padding: "0.4rem 0.75rem",
  borderRadius: 4,
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const smallDangerBtn = {
  background: "transparent",
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  padding: "0.4rem 0.75rem",
  borderRadius: 4,
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};
