"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { use as usePromise } from "react";
import Link from "next/link";
import { label, input, fieldGroup, submitButton, errorText } from "@/components/formStyles";
import { STATUS_LABEL, type ExamStatus } from "@/lib/examStatus";

type PublishCheck = { label: string; ok: boolean };
type Exam = {
  id: string;
  name: string;
  order: number;
  numQuestions: number;
  durationMinutes: number;
  passingScore: number;
  instructions: string | null;
  published: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  startAt: string | null;
  endAt: string | null;
  status: ExamStatus;
  course: { id: string; name: string };
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();

  const [exam, setExam] = useState<Exam | null>(null);
  const [checks, setChecks] = useState<PublishCheck[]>([]);
  const [canPublish, setCanPublish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    numQuestions: "1",
    durationMinutes: "30",
    passingScore: "50",
    order: "0",
    instructions: "",
    shuffleQuestions: true,
    shuffleOptions: true,
    startAt: "",
    endAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/exams/${id}`);
    const data = await res.json();
    if (res.ok) {
      setExam(data.exam);
      setChecks(data.validation.checks);
      setCanPublish(data.validation.canPublish);
      setForm({
        name: data.exam.name,
        numQuestions: String(data.exam.numQuestions),
        durationMinutes: String(data.exam.durationMinutes),
        passingScore: String(data.exam.passingScore),
        order: String(data.exam.order),
        instructions: data.exam.instructions ?? "",
        shuffleQuestions: data.exam.shuffleQuestions,
        shuffleOptions: data.exam.shuffleOptions,
        startAt: toLocalInputValue(data.exam.startAt),
        endAt: toLocalInputValue(data.exam.endAt),
      });
    } else {
      setError(data.error ?? "Couldn't load this exam.");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function payload() {
    return {
      name: form.name.trim(),
      numQuestions: Number(form.numQuestions),
      durationMinutes: Number(form.durationMinutes),
      passingScore: Number(form.passingScore),
      order: Number(form.order),
      instructions: form.instructions.trim() || null,
      shuffleQuestions: form.shuffleQuestions,
      shuffleOptions: form.shuffleOptions,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
      endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
    };
  }

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/exams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't save changes.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/exams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), action: "publish" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.validation) {
          setChecks(data.validation.checks);
          setCanPublish(data.validation.canPublish);
        }
        setError(data.error ?? "Couldn't publish this exam.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    await fetch(`/api/admin/exams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unpublish" }),
    });
    setBusy(false);
    await load();
  }

  async function deleteExam() {
    if (!confirm("Delete this exam? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/exams/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin/exams");
    } else {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ color: "var(--ink-600)" }}>Loading…</p>;
  if (!exam) return <p style={errorText}>{error ?? "Exam not found."}</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/admin/exams" style={{ color: "var(--ink-600)", fontSize: "0.9rem", textDecoration: "none" }}>
        ← All exams
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", margin: "1rem 0 1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.3rem" }}>{exam.name}</h1>
          <p style={{ color: "var(--ink-600)" }}>{exam.course.name}</p>
        </div>
        <StatusBadge status={exam.status} />
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.9rem" }}>Exam validation</h2>
        {checks.map((c) => (
          <div key={c.label} style={{ display: "flex", gap: "0.6rem", padding: "0.3rem 0", fontSize: "0.92rem" }}>
            <span style={{ color: c.ok ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
              {c.ok ? "✓" : "✗"}
            </span>
            <span style={{ color: c.ok ? "var(--ink-900)" : "var(--danger)" }}>{c.label}</span>
          </div>
        ))}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
          {exam.published ? (
            <button onClick={unpublish} disabled={busy} style={dangerBtn}>
              Unpublish exam
            </button>
          ) : (
            <button onClick={publish} disabled={busy || !canPublish} style={canPublish ? submitButton : disabledBtn}>
              {canPublish ? "Publish exam" : "Cannot publish yet"}
            </button>
          )}
        </div>
        {!canPublish && !exam.published && checks.some((c) => c.label.includes("Question Bank")) && (
          <p style={{ fontSize: "0.85rem", color: "var(--ink-600)", marginTop: "0.75rem" }}>
            Add active questions for this course in the{" "}
            <Link href={`/admin/questions?courseId=${exam.course.id}`} style={{ color: "var(--gold-600)", fontWeight: 600 }}>
              Question Bank
            </Link>{" "}
            until the count matches this exam&apos;s configured question total.
          </p>
        )}
      </div>

      <form
        onSubmit={saveChanges}
        style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.75rem" }}
      >
        {error && <p style={errorText}>{error}</p>}

        <div style={fieldGroup}>
          <label style={label} htmlFor="name">Exam name</label>
          <input style={input} id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: "0.8rem" }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="numQuestions">Number of questions</label>
            <input style={input} id="numQuestions" type="number" min={1} value={form.numQuestions} onChange={(e) => update("numQuestions", e.target.value)} />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="durationMinutes">Duration (minutes)</label>
            <input style={input} id="durationMinutes" type="number" min={1} value={form.durationMinutes} onChange={(e) => update("durationMinutes", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.8rem" }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="passingScore">Passing score (%)</label>
            <input style={input} id="passingScore" type="number" min={0} max={100} value={form.passingScore} onChange={(e) => update("passingScore", e.target.value)} />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="order">Display order</label>
            <input style={input} id="order" type="number" min={0} value={form.order} onChange={(e) => update("order", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.8rem" }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="startAt">Start date/time</label>
            <input style={input} id="startAt" type="datetime-local" value={form.startAt} onChange={(e) => update("startAt", e.target.value)} />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={label} htmlFor="endAt">End date/time</label>
            <input style={input} id="endAt" type="datetime-local" value={form.endAt} onChange={(e) => update("endAt", e.target.value)} />
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={label} htmlFor="instructions">Instructions</label>
          <textarea id="instructions" rows={3} style={{ ...input, resize: "vertical" as const }} value={form.instructions} onChange={(e) => update("instructions", e.target.value)} />
        </div>

        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => update("shuffleQuestions", e.target.checked)} />
            Shuffle questions
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
            <input type="checkbox" checked={form.shuffleOptions} onChange={(e) => update("shuffleOptions", e.target.checked)} />
            Shuffle answer options
          </label>
        </div>

        {exam.published && (
          <p style={{ fontSize: "0.85rem", color: "var(--gold-600)", marginBottom: "1.1rem" }}>
            Saving changes will unpublish this exam — you'll need to publish it again afterward.
          </p>
        )}

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button style={{ ...submitButton, width: "auto", flex: "1 1 160px" }} type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={deleteExam} disabled={busy} style={{ ...dangerBtn, flex: "0 0 auto" }}>
            Delete exam
          </button>
        </div>
      </form>
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
    <span style={{ background: c.bg, color: c.fg, padding: "0.35rem 0.75rem", borderRadius: 4, fontSize: "0.82rem", fontWeight: 600 }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const dangerBtn = {
  background: "transparent",
  border: "1px solid var(--danger)",
  color: "var(--danger)",
  padding: "0.7rem 1.1rem",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
} as const;

const disabledBtn = {
  background: "#e5ddd0",
  color: "var(--ink-600)",
  border: "none",
  padding: "0.8rem 1.1rem",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "not-allowed",
} as const;
