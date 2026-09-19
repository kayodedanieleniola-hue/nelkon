import Link from "next/link";
import { getOverviewStats } from "@/lib/adminStats";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const stats = await getOverviewStats();

  return (
    <div>
      <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
        Overview
      </p>
      <h1 style={{ fontSize: "1.9rem", marginBottom: "2rem" }}>Platform at a glance</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "2.5rem",
        }}
      >
        <StatCard label="Total students" value={stats.totalStudents} />
        <StatCard label="Active courses" value={stats.totalCourses} />
        <StatCard label="Exams configured" value={stats.exams.total} />
        <StatCard label="Ongoing now" value={stats.exams.ongoing} accent />
        <StatCard label="Upcoming" value={stats.exams.upcoming} />
        <StatCard label="Closed" value={stats.exams.closed} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1.2rem" }}>Recent registrations</h2>
        <Link href="/admin/students" style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none" }}>
          View all students →
        </Link>
      </div>

      {stats.recentStudents.length === 0 ? (
        <div style={emptyState}>No students have registered yet.</div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {stats.recentStudents.map((s, i) => (
            <div
              key={s.studentId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.9rem 1.25rem",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: "var(--burgundy-900)" }}>{s.fullName}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-600)" }}>
                  {s.studentId} &middot; {s.course}
                </p>
              </div>
              <span style={{ fontSize: "0.82rem", color: "var(--ink-600)" }}>
                {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: 6,
        padding: "1.1rem 1.25rem",
      }}
    >
      <p style={{ margin: "0 0 0.3rem", fontSize: "0.82rem", color: "var(--ink-600)" }}>{label}</p>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontSize: "1.9rem",
          color: accent ? "var(--success)" : "var(--burgundy-900)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

const emptyState = {
  border: "1px dashed var(--gold-400)",
  borderRadius: 6,
  padding: "1.5rem",
  color: "var(--ink-600)",
} as const;
