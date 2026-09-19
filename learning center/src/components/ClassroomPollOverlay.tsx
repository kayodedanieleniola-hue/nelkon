"use client";

import { useEffect, useState } from "react";

type PollData = {
  id: string;
  classId: string;
  question: string;
  options: string[];
  counts: Record<number, number>;
  totalVotes: number;
};

export default function ClassroomPollOverlay({
  classId,
  studentId,
}: {
  classId: string;
  studentId?: string;
}) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchActivePoll() {
      try {
        const res = await fetch(`/api/learning/polls?classId=${encodeURIComponent(classId)}`);
        const data = await res.json();
        if (active && res.ok && data.polls && data.polls.length > 0) {
          const current = data.polls[0];
          setPoll(current);
        }
      } catch {
        // Poll fetch error
      }
    }

    void fetchActivePoll();
    const interval = setInterval(fetchActivePoll, 3000);

    // Listen for BroadcastChannel poll events
    let bc: BroadcastChannel | undefined;
    try {
      bc = new BroadcastChannel(`nak-classroom-${classId}`);
      bc.onmessage = (event) => {
        if (!active) return;
        if (event.data?.type === "LIVE_POLL" && event.data.poll) {
          setPoll(event.data.poll);
          setIsDismissed(false);
        }
      };
    } catch {
      // BroadcastChannel fallback
    }

    return () => {
      active = false;
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, [classId]);

  if (!poll || isDismissed) return null;

  const total = poll.totalVotes || 0;

  const handleVote = async (index: number) => {
    setSelectedOption(index);
    setIsSubmitting(true);
    try {
      await fetch("/api/learning/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_VOTE",
          pollId: poll.id,
          optionIndex: index,
          studentId,
        }),
      });
    } catch {
      // Vote submission error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={cardContainer}>
      <div style={cardHeader}>
        <div>
          <span style={liveBadge}>LIVE IN-CLASS POLL</span>
          <h4 style={questionTitle}>{poll.question}</h4>
        </div>
        <button type="button" onClick={() => setIsDismissed(true)} style={dismissBtn}>
          Close
        </button>
      </div>

      <div style={optionsList}>
        {poll.options.map((optionText, idx) => {
          const votes = poll.counts[idx] || 0;
          const percentage = total > 0 ? Math.round((votes / total) * 100) : 0;
          const isSelected = selectedOption === idx;

          return (
            <button
              key={idx}
              type="button"
              disabled={isSubmitting}
              onClick={() => handleVote(idx)}
              style={{
                ...optionCard,
                borderColor: isSelected ? "#ffd98a" : "#4a2020",
                background: isSelected ? "#4d1010" : "#1a0b0b",
              }}
            >
              <div style={optionInfo}>
                <span style={optionTextCss}>{optionText}</span>
                <span style={percentText}>{percentage}% ({votes})</span>
              </div>
              <div style={progressTrack}>
                <div
                  style={{
                    ...progressBar,
                    width: `${percentage}%`,
                    background: isSelected ? "linear-gradient(90deg, #98661B, #ffd98a)" : "#691f1f",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <div style={cardFooter}>
        <span style={voteCountText}>{total} total vote{total === 1 ? "" : "s"}</span>
        {selectedOption !== null && <span style={votedTag}>Vote Submitted</span>}
      </div>
    </div>
  );
}

const cardContainer = {
  position: "absolute",
  bottom: "1.2rem",
  right: "1.2rem",
  width: "320px",
  maxWidth: "calc(100vw - 2.4rem)",
  background: "#220c0c",
  border: "1px solid #98661B",
  borderRadius: 10,
  padding: "1rem",
  boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
  zIndex: 60,
  color: "#f3eee7",
} as const;

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.5rem",
  marginBottom: "0.75rem",
} as const;

const liveBadge = {
  fontSize: "0.68rem",
  color: "#ffd98a",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
} as const;

const questionTitle = {
  margin: "0.25rem 0 0",
  fontSize: "0.95rem",
  fontWeight: 700,
  color: "#fff",
  lineHeight: 1.3,
} as const;

const dismissBtn = {
  background: "none",
  border: "none",
  color: "#b08585",
  fontSize: "0.9rem",
  cursor: "pointer",
  padding: "0.1rem 0.3rem",
} as const;

const optionsList = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
} as const;

const optionCard = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  textAlign: "left",
  padding: "0.55rem 0.75rem",
  borderRadius: 6,
  border: "1px solid #4a2020",
  cursor: "pointer",
  transition: "all 0.15s ease",
} as const;

const optionInfo = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const optionTextCss = {
  fontSize: "0.85rem",
  fontWeight: 600,
  color: "#fff",
} as const;

const percentText = {
  fontSize: "0.75rem",
  color: "#ffd98a",
  fontWeight: 700,
} as const;

const progressTrack = {
  width: "100%",
  height: "6px",
  background: "#100505",
  borderRadius: 3,
  overflow: "hidden",
} as const;

const progressBar = {
  height: "100%",
  transition: "width 0.4s ease",
} as const;

const cardFooter = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "0.75rem",
  paddingTop: "0.5rem",
  borderTop: "1px solid #3d1717",
  fontSize: "0.72rem",
  color: "#b08585",
} as const;

const voteCountText = {} as const;

const votedTag = {
  color: "#4ade80",
  fontWeight: 700,
} as const;
