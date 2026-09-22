"use client";

import { useEffect, useState } from "react";

type Event = {
  id: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorLabel: string | null; // student ID, when known
  action: string;
  detail: string | null;
  createdAt: string;
};

const HIGH_SEVERITY = new Set([
  "student.identity_mismatch",
  "student.presence_multiple_faces",
  "student.camera_disconnected",
  "student.duplicate_session",
  "student.fullscreen_exited",
  "admin.terminate_exam",
]);

export default function SuspiciousPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/suspicious")
      .then((response) => response.json())
      .then((data) => setEvents(data.events ?? []))
      .finally(() => setLoading(false));
  }, []);

  const visible = events.filter((event) => {
    const value = `${event.actorName ?? ""} ${event.actorLabel ?? ""} ${label[event.action] ?? event.action} ${event.detail ?? ""}`.toLowerCase();
    return value.includes(search.toLowerCase().trim());
  });

  return (
    <div>
      <p style={eyebrow}>Security review</p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.5rem" }}>Suspicious activity</h1>
      <p style={muted}>
        Review flags only — none of these automatically fail or block a student. A human should
        review before taking any action.
      </p>

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by student name, Student ID, or offense"
        style={searchInput}
      />

      {loading ? (
        <p style={muted}>Loading...</p>
      ) : visible.length === 0 ? (
        <p style={empty}>{events.length === 0 ? "No suspicious activity recorded." : "No events match this search."}</p>
      ) : (
        <div style={list}>
          {visible.map((event) => {
            const high = HIGH_SEVERITY.has(event.action);
            const who =
              event.actorType === "student"
                ? event.actorName ?? "Unknown student"
                : event.actorType === "admin"
                ? `Admin: ${event.actorName ?? "Unknown admin"}`
                : "System";
            return (
              <article key={event.id} style={{ ...card, borderLeft: `4px solid ${high ? "var(--danger)" : "var(--gold-400)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                  <strong style={{ color: "var(--burgundy-900)", fontSize: "1.05rem" }}>
                    {who}
                    {event.actorLabel && <span style={{ color: "var(--ink-600)", fontWeight: 400, fontSize: "0.85rem" }}> · {event.actorLabel}</span>}
                  </strong>
                  {high && <span style={badge}>Review recommended</span>}
                </div>
                <p style={offenseText}>{label[event.action] ?? event.action}</p>
                <p style={small}>{event.detail ?? "No additional detail"}</p>
                <p style={small}>{new Date(event.createdAt).toLocaleString()}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const label: Record<string, string> = {
  "student.login_failed": "Failed student sign-in",
  "admin.login_failed": "Failed admin sign-in",
  "student.exam_timeout": "Exam timed out",
  "student.identity_mismatch": "Identity check mismatch",
  "student.presence_no_face": "No face detected during exam",
  "student.presence_multiple_faces": "Multiple faces detected during exam",
  "student.camera_blocked": "Camera/microphone permission blocked",
  "student.camera_disconnected": "Camera disconnected during exam",
  "student.duplicate_session": "Exam opened in a second window/device",
  "student.fullscreen_exited": "Exited full-screen during exam",
  "student.tab_hidden": "Switched away from exam tab",
  "admin.warn_student": "Admin sent a warning",
  "admin.terminate_exam": "Admin terminated an exam",
  "admin.force_submit_exam": "Admin force-submitted an exam",
};
const eyebrow = { color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem" } as const;
const muted = { color: "var(--ink-600)", fontSize: "0.9rem" } as const;
const searchInput = { width: "100%", maxWidth: 520, border: "1px solid var(--line)", borderRadius: 4, padding: "0.7rem 0.75rem", margin: "1rem 0 1.25rem" } as const;
const empty = { border: "1px dashed var(--gold-400)", borderRadius: 6, padding: "1.5rem", color: "var(--ink-600)" } as const;
const list = { display: "grid", gap: "0.8rem" } as const;
const card = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.15rem" } as const;
const offenseText = { color: "var(--danger)", fontWeight: 600, fontSize: "0.92rem", margin: "0 0 0.3rem" } as const;
const small = { color: "var(--ink-600)", fontSize: "0.8rem", margin: "0.2rem 0 0" } as const;
const badge = { background: "#f2e3e0", color: "var(--danger)", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 4, alignSelf: "flex-start" } as const;
