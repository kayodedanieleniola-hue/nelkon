"use client";

import { useEffect, useState } from "react";
import { use as usePromise } from "react";
import Link from "next/link";

type QuestionRow = {
  id: string;
  position: number;
  text: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number | null;
};

type AttemptDetail = {
  id: string;
  status: string;
  student: { studentId: string; fullName: string; email: string };
  course: string;
  exam: string;
  passingScore: number;
  score: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
  endedBy: string | null;
  endReason: string | null;
  questions: QuestionRow[];
};

type Event = { id: string; action: string; detail: string | null; createdAt: string };

export default function ResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/results/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load this result.");
        setAttempt(data.attempt);
        setEvents(data.events ?? []);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p style={{ color: "var(--ink-600)" }}>Loading…</p>;
  if (error || !attempt) return <p style={{ color: "var(--danger)" }}>{error ?? "Result not found."}</p>;

  return (
    <div>
      <Link href="/admin/results" style={{ color: "var(--ink-600)", fontSize: "0.9rem", textDecoration: "none" }}>
        ← All results
      </Link>

      <div style={{ margin: "1rem 0 2rem" }}>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.3rem" }}>{attempt.student.fullName}</h1>
        <p style={{ color: "var(--ink-600)" }}>
          {attempt.student.studentId} &middot; {attempt.course} &middot; {attempt.exam}
        </p>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        <Field label="Score" value={attempt.status === "TERMINATED" ? "—" : `${attempt.score}%`} />
        <Field label="Passing score" value={`${attempt.passingScore}%`} />
        <Field
          label="Result"
          value={attempt.status === "TERMINATED" ? "Terminated" : attempt.status === "TIMED_OUT" ? "Timed out" : attempt.passed ? "Passed" : "Not passed"}
        />
        <Field label="Started" value={new Date(attempt.startedAt).toLocaleString()} />
        <Field label="Ended" value={attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "—"} />
        <Field label="Ended by" value={attempt.endedBy ?? "—"} />
      </div>

      {attempt.endReason && (
        <p style={{ background: "#f1e2c2", padding: "0.75rem 1rem", borderRadius: 4, fontSize: "0.9rem", marginBottom: "2rem" }}>
          <strong>Reason:</strong> {attempt.endReason}
        </p>
      )}

      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Answer breakdown</h2>
      {attempt.questions.length === 0 ? (
        <p style={{ color: "var(--ink-600)", marginBottom: "2rem" }}>No questions recorded for this attempt.</p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem", marginBottom: "2.5rem" }}>
          {attempt.questions.map((q) => {
            const correct = q.selectedIndex === q.correctIndex;
            return (
              <div key={q.id} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.1rem 1.25rem" }}>
                <p style={{ fontSize: "0.8rem", color: "var(--ink-600)", marginBottom: "0.3rem" }}>Question {q.position + 1}</p>
                <p style={{ fontWeight: 600, color: "var(--burgundy-900)", marginBottom: "0.6rem" }}>{q.text}</p>
                <div style={{ display: "grid", gap: "0.25rem", fontSize: "0.88rem" }}>
                  {q.options.map((option, index) => {
                    const isCorrect = index === q.correctIndex;
                    const isSelected = index === q.selectedIndex;
                    return (
                      <span
                        key={option}
                        style={{
                          color: isCorrect ? "var(--success)" : isSelected ? "var(--danger)" : "var(--ink-600)",
                          fontWeight: isCorrect || isSelected ? 700 : 400,
                        }}
                      >
                        {option} {isCorrect && "(correct)"} {isSelected && !isCorrect && "(selected)"}
                      </span>
                    );
                  })}
                  {q.selectedIndex === null && <span style={{ color: "var(--ink-600)" }}>Not answered</span>}
                </div>
                {!correct && q.selectedIndex !== null && (
                  <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginTop: "0.4rem" }}>Incorrect</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>Activity during this attempt</h2>
      {events.length === 0 ? (
        <p style={{ color: "var(--ink-600)" }}>No monitoring events recorded for this attempt.</p>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {events.map((e, i) => (
            <div key={e.id} style={{ padding: "0.85rem 1.25rem", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <strong style={{ fontSize: "0.9rem" }}>{eventLabel[e.action] ?? e.action}</strong>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--ink-600)" }}>
                {e.detail} &middot; {new Date(e.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const eventLabel: Record<string, string> = {
  "student.identity_baseline_set": "Identity baseline captured",
  "student.identity_verified": "Identity verified",
  "student.identity_mismatch": "Identity mismatch",
  "student.presence_no_face": "No face detected",
  "student.presence_multiple_faces": "Multiple faces detected",
  "student.camera_blocked": "Camera/mic permission blocked",
  "student.camera_disconnected": "Camera disconnected",
  "student.fullscreen_exited": "Exited full-screen",
  "student.tab_hidden": "Switched away from exam tab",
  "student.duplicate_session": "Exam opened in a second window/device",
  "student.exam_timeout": "Exam timed out",
  "student.submit_exam": "Submitted",
  "student.start_exam": "Started",
  "admin.warn_student": "Admin sent a warning",
  "admin.terminate_exam": "Admin terminated the exam",
  "admin.force_submit_exam": "Admin force-submitted the exam",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: "0.8rem", color: "var(--ink-600)", marginBottom: "0.2rem" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", color: "var(--burgundy-900)", margin: 0 }}>{value}</p>
    </div>
  );
}
