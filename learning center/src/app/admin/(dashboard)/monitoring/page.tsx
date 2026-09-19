"use client";

import { useEffect, useState } from "react";
import LiveKitFeed from "@/components/LiveKitFeed";
import AdminAttemptControls from "@/components/AdminAttemptControls";

type Attempt = { id: string; student: { studentId: string; fullName: string; email: string }; exam: string; course: string; startedAt: string; expiresAt: string };

export default function MonitoringPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch("/api/admin/monitoring");
    const data = await response.json();
    if (response.ok) setAttempts(data.attempts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div>
      <p style={eyebrow}>Live view</p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.5rem" }}>Live monitoring</h1>
      <p style={muted}>Active exam attempts, refreshed every 15 seconds.</p>
      {loading ? (
        <p style={muted}>Loading...</p>
      ) : attempts.length === 0 ? (
        <p style={empty}>No students are taking an exam right now.</p>
      ) : (
        <div style={grid}>
          {attempts.map((attempt) => (
            <article key={attempt.id} style={card}>
              <div>
                <strong>{attempt.student.fullName}</strong>
                <p style={small}>{attempt.student.studentId} · {attempt.student.email}</p>
              </div>
              <p style={{ margin: "0.8rem 0 0" }}>{attempt.course} / {attempt.exam}</p>
              <LiveKitFeed attemptId={attempt.id} />
              <p style={small}>
                Started {new Date(attempt.startedAt).toLocaleString()}
                <br />
                Expires {new Date(attempt.expiresAt).toLocaleString()}
              </p>
              <AdminAttemptControls attemptId={attempt.id} onEnded={() => void load()} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const eyebrow = { color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem" } as const;
const muted = { color: "var(--ink-600)", fontSize: "0.9rem" } as const;
const empty = { border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.8rem" } as const;
const card = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.15rem" } as const;
const small = { color: "var(--ink-600)", fontSize: "0.8rem" } as const;
