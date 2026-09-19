"use client";

import { useState } from "react";
import Link from "next/link";
import CertificateModal, { CertificateData } from "@/components/CertificateModal";
import ClassroomReplayPlayer from "@/components/ClassroomReplayPlayer";

type LearningClassItem = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  recordingUrl?: string | null;
};

type MaterialItem = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
};

export default function StudentLearningDashboard({
  studentName,
  studentId,
  courseName,
  progressPercent,
  attendedCount,
  totalClasses,
  passedExamsCount,
  totalExams,
  allClasses,
  materials,
  certificate,
}: {
  studentName: string;
  studentId: string;
  courseName: string;
  progressPercent: number;
  attendedCount: number;
  totalClasses: number;
  passedExamsCount: number;
  totalExams: number;
  allClasses: LearningClassItem[];
  materials: MaterialItem[];
  certificate?: CertificateData | null;
}) {
  const [showCertModal, setShowCertModal] = useState(false);
  const [selectedReplay, setSelectedReplay] = useState<LearningClassItem | null>(null);

  const activeCert: CertificateData = certificate || {
    code: `CERT-NAK-2026-${studentId.replace(/\D/g, "") || "9021"}`,
    issuedAt: new Date().toISOString(),
    grade: progressPercent >= 85 ? "FIRST CLASS HONORS" : "EXCELLENCE",
    studentName,
    studentId,
    courseName,
  };

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* Dynamic Course Progress Card */}
      <section style={progressCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <p style={eyebrow}>Verified Course Progress</p>
            <h2 style={{ margin: "0.2rem 0", color: "#5c1d1d", fontSize: "1.8rem" }}>
              {progressPercent}% Complete
            </h2>
            <p style={muted}>
              {attendedCount} of {totalClasses} classes attended · {passedExamsCount} of {totalExams} assessments passed
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCertModal(true)}
            style={certBtn}
          >
            View / Download Certificate
          </button>
        </div>

        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${progressPercent}%` }} />
        </div>
      </section>

      {/* Completed & Recorded Replay Classes */}
      <h2 style={heading}>Archived & Recorded Class Replays</h2>
      {allClasses.filter((c) => c.status === "COMPLETED" || c.recordingUrl).length === 0 ? (
        <div style={emptyCard}>
          <p style={{ margin: 0 }}>No archived class replays are available yet. Completed live classes will appear here for replay.</p>
        </div>
      ) : (
        <div style={classGrid}>
          {allClasses
            .filter((c) => c.status === "COMPLETED" || c.recordingUrl)
            .map((item) => (
              <article key={item.id} style={replayCard}>
                <span style={replayBadge}>CLASS REPLAY</span>
                <h3 style={replayTitle}>{item.title}</h3>
                <p style={muted}>Class session ended · Recorded broadcast replay available</p>
                <button
                  type="button"
                  onClick={() => setSelectedReplay(item)}
                  style={watchReplayBtn}
                >
                  Watch Class Replay
                </button>
              </article>
            ))}
        </div>
      )}

      {/* Certificate Modal Popup */}
      {showCertModal && (
        <CertificateModal
          data={activeCert}
          onClose={() => setShowCertModal(false)}
        />
      )}

      {/* Replay Player Modal Popup */}
      {selectedReplay && (
        <ClassroomReplayPlayer
          classTitle={selectedReplay.title}
          videoUrl={selectedReplay.recordingUrl || "/sample-replay.mp4"}
          materials={materials}
          onClose={() => setSelectedReplay(null)}
        />
      )}
    </div>
  );
}

const progressCard = {
  background: "#fff",
  border: "1px solid #e2d8cd",
  borderRadius: 10,
  padding: "1.35rem",
  marginBottom: "1.5rem",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
} as const;

const eyebrow = {
  color: "#98661B",
  fontSize: "0.8rem",
  fontWeight: 700,
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
} as const;

const muted = {
  color: "#6b5849",
  fontSize: "0.85rem",
  margin: "0.2rem 0 0",
} as const;

const progressTrack = {
  height: 10,
  background: "#efe9e0",
  borderRadius: 99,
  overflow: "hidden",
  marginTop: "1rem",
} as const;

const progressFill = {
  height: "100%",
  background: "linear-gradient(90deg, #98661B, #d4af37)",
  borderRadius: 99,
  transition: "width 0.5s ease",
} as const;

const certBtn = {
  background: "linear-gradient(135deg, #5c1d1d, #802626)",
  color: "#ffd98a",
  border: "1px solid #98661B",
  borderRadius: 8,
  padding: "0.6rem 1.1rem",
  fontSize: "0.88rem",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(92, 29, 29, 0.25)",
} as const;

const heading = {
  color: "#5c1d1d",
  fontSize: "1.35rem",
  margin: "2rem 0 0.8rem",
  fontWeight: 700,
} as const;

const emptyCard = {
  background: "#fff",
  border: "1px dashed #d4af37",
  borderRadius: 8,
  padding: "1.25rem",
  color: "#6b5849",
  fontSize: "0.88rem",
} as const;

const classGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "1rem",
} as const;

const replayCard = {
  background: "#fff",
  border: "1px solid #e2d8cd",
  borderTop: "4px solid #98661B",
  borderRadius: 8,
  padding: "1.1rem",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "0.5rem",
} as const;

const replayBadge = {
  fontSize: "0.68rem",
  color: "#98661B",
  fontWeight: 700,
  letterSpacing: "0.05em",
} as const;

const replayTitle = {
  margin: "0.1rem 0",
  fontSize: "1.05rem",
  fontWeight: 700,
  color: "#330808",
} as const;

const watchReplayBtn = {
  background: "#98661B",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "0.45rem 0.85rem",
  fontSize: "0.82rem",
  fontWeight: 700,
  cursor: "pointer",
  marginTop: "0.5rem",
  textAlign: "center",
} as const;
