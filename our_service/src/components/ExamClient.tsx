"use client";

import { useEffect, useRef, useState } from "react";
import CameraCheck from "@/components/CameraCheck";

type Question = {
  id: string;
  position: number;
  text: string;
  options: string[];
  selectedIndex: number | null;
};

type Attempt = {
  id: string;
  examId: string;
  status: string;
  expiresAt: string;
  questions: Question[];
};

type Result = {
  status: string;
  score: number;
  passed: boolean;
  correctAnswers: number;
  totalQuestions: number;
};

type EndedInfo = { status: string; endedBy?: string | null; endReason?: string | null };

const HEARTBEAT_INTERVAL_MS = 20_000;

function getSessionId(examId: string) {
  const key = `nak_exam_session_${examId}`;
  let value = window.sessionStorage.getItem(key);
  if (!value) {
    value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    window.sessionStorage.setItem(key, value);
  }
  return value;
}

function describeEnded(info: EndedInfo): string {
  if (info.status === "TERMINATED") {
    return info.endReason
      ? `This exam was terminated by an administrator: ${info.endReason}`
      : "This exam was terminated by an administrator.";
  }
  if (info.endedBy?.startsWith("admin:")) {
    return info.endReason
      ? `This exam was submitted by an administrator: ${info.endReason}`
      : "This exam was submitted by an administrator.";
  }
  if (info.status === "TIMED_OUT") return "This exam's time expired.";
  return "This exam has already ended.";
}

export default function ExamClient({ examId }: { examId: string }) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [message, setMessage] = useState("Starting exam...");
  const [actionError, setActionError] = useState<string | null>(null);
  const [attemptGone, setAttemptGone] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [ended, setEnded] = useState<EndedInfo | null>(null);
  const [superseded, setSuperseded] = useState(false);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    sessionIdRef.current = getSessionId(examId);
    fetch(`/api/exams/${examId}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to start exam");
        setAttempt(data.attempt);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, [examId]);

  useEffect(() => {
    if (!attempt) return;
    const update = () => setSecondsLeft(Math.max(0, Math.floor((Date.parse(attempt.expiresAt) - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [attempt]);

  useEffect(() => {
    if (attempt && secondsLeft !== null && secondsLeft === 0 && !result && !busy && !attemptGone && !sessionExpired && !ended && !superseded) {
      submitExam();
    }
  }, [secondsLeft, attempt, result, busy, attemptGone, sessionExpired, ended, superseded]);

  // Heartbeat — keeps this session's lease alive for duplicate-session
  // detection, and is how admin warnings/terminations/force-submits reach
  // an already-open exam tab without needing a live socket connection.
  useEffect(() => {
    if (!attempt || result || attemptGone || sessionExpired || ended || superseded) return;
    const tick = async () => {
      try {
        const response = await fetch(`/api/attempts/${attempt.id}/monitor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "heartbeat", sessionId: sessionIdRef.current }),
        });
        if (response.status === 401) {
          // A background-tab reload sometimes drops the session cookie —
          // the attempt itself and every saved answer are still intact
          // server-side, so this is recoverable, not "exam over."
          setSessionExpired(true);
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (data.superseded) {
          setSuperseded(true);
          return;
        }
        if (data.ended) {
          setEnded({ status: data.status, endedBy: data.endedBy, endReason: data.endReason });
          return;
        }
        if (data.warning) setWarningBanner(data.warning);
      } catch {
        // A missed heartbeat isn't itself an error — just try again next tick.
      }
    };
    void tick();
    const timer = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [attempt, result, attemptGone, sessionExpired, ended, superseded]);

  useEffect(() => {
    setFullscreenSupported(!!document.documentElement.requestFullscreen);
  }, []);

  // Full-screen exit detection (entering full-screen itself needs a real
  // click — see the "Enter full-screen" button in the render below; most
  // browsers silently ignore requestFullscreen() called without one).
  useEffect(() => {
    if (!attempt || result) return;
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        void reportFocusEvent(attempt!.id, "fullscreen_exited");
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [attempt, result]);

  // Tab-switch / minimize detection.
  useEffect(() => {
    if (!attempt || result) return;
    function onVisibilityChange() {
      if (document.hidden) void reportFocusEvent(attempt!.id, "tab_hidden");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [attempt, result]);

  async function reportFocusEvent(attemptId: string, event: "fullscreen_exited" | "tab_hidden") {
    try {
      await fetch(`/api/attempts/${attemptId}/monitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "focus", event }),
      });
    } catch {
      // Best-effort — never block the exam over a logging failure.
    }
  }

  function enterFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function chooseAnswer(selectedIndex: number) {
    if (!attempt || busy) return;
    const question = attempt.questions[current];
    setAttempt({ ...attempt, questions: attempt.questions.map((item) => item.id === question.id ? { ...item, selectedIndex } : item) });
    try {
      const response = await fetch(`/api/attempts/${attempt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, selectedIndex }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        handleActionFailure(response.status, data.error, "Your answer wasn't saved");
      } else {
        setActionError(null);
      }
    } catch {
      setActionError("Your answer wasn't saved — check your connection.");
    }
  }

  async function submitExam() {
    if (!attempt || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/attempts/${attempt.id}`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setResult(data.result);
      } else {
        handleActionFailure(response.status, data.error, "Unable to submit exam");
      }
    } catch {
      setActionError("Couldn't reach the server. Check your connection and try submitting again.");
    } finally {
      setBusy(false);
    }
  }

  function handleActionFailure(status: number, serverError: string | undefined, fallback: string) {
    if (status === 401) {
      setSessionExpired(true);
      return;
    }
    if (status === 404) {
      setAttemptGone(true);
      setActionError("This exam session is no longer valid. It may have been reset by an administrator.");
      return;
    }
    setActionError(serverError || fallback);
  }

  if (result) {
    return <main style={shell}><section style={panel}><p style={eyebrow}>Exam complete</p><h1>Your result</h1><p style={{ fontSize: "2rem", color: "var(--burgundy-900)" }}>{result.score}%</p><p>{result.passed ? "Passed" : "Did not pass"} · {result.correctAnswers} of {result.totalQuestions} correct</p><a href="/dashboard" style={button}>Return to dashboard</a></section></main>;
  }

  if (sessionExpired) {
    return <main style={shell}><section style={panel}><p style={eyebrow}>Please log in again</p><h1>Your session expired</h1><p style={{ color: "var(--ink-600)", margin: "0.75rem 0 1.5rem" }}>This can happen if your browser reloaded the page in the background — for example after switching tabs for a while. Your answers so far are saved. Log in again, then tap Start Exam for this same test to pick up right where you left off.</p><a href="/login" style={button}>Log in again</a></section></main>;
  }

  if (superseded) {
    return <main style={shell}><section style={panel}><p style={{ ...eyebrow, color: "var(--danger)" }}>Session ended</p><h1>This exam was opened in another window or device</h1><p style={{ color: "var(--ink-600)", margin: "0.75rem 0 1.5rem" }}>Only one active session is allowed per exam. This tab is no longer active.</p><a href="/dashboard" style={button}>Return to dashboard</a></section></main>;
  }

  if (ended) {
    return <main style={shell}><section style={panel}><p style={{ ...eyebrow, color: "var(--danger)" }}>Exam ended</p><h1>{describeEnded(ended)}</h1><a href="/dashboard" style={{ ...button, marginTop: "1.25rem", display: "inline-block" }}>Return to dashboard</a></section></main>;
  }

  if (attemptGone) {
    return <main style={shell}><section style={panel}><p style={{ ...eyebrow, color: "var(--danger)" }}>Session ended</p><h1>{actionError}</h1><p style={{ color: "var(--ink-600)", margin: "0.75rem 0 1.5rem" }}>Go back to your dashboard and start the exam again to get a fresh attempt.</p><a href="/dashboard" style={button}>Return to dashboard</a></section></main>;
  }

  if (!attempt) return <main style={shell}><section style={panel}><p>{message}</p></section></main>;

  const question = attempt.questions[current];
  const safeSecondsLeft = secondsLeft ?? 0;
  const minutes = Math.floor(safeSecondsLeft / 60).toString().padStart(2, "0");
  const seconds = (safeSecondsLeft % 60).toString().padStart(2, "0");

  return (
    <main style={shell}>
      <section style={{ ...panel, maxWidth: 780 }}>
        <CameraCheck attemptId={attempt.id} />
        <div style={topbar}>
          <span>Question {current + 1} of {attempt.questions.length}</span>
          <strong>{minutes}:{seconds}</strong>
        </div>
        {warningBanner && (
          <p style={warningBannerStyle}>
            <strong>Message from administrator:</strong> {warningBanner}{" "}
            <button type="button" onClick={() => setWarningBanner(null)} style={dismissBtn}>Dismiss</button>
          </p>
        )}
        {!isFullscreen && fullscreenSupported && (
          <p style={fullscreenBanner}>
            This exam works best in full-screen — exiting it during the exam is logged for review.{" "}
            <button type="button" onClick={enterFullscreen} style={dismissBtn}>Enter full-screen</button>
          </p>
        )}
        {actionError && <p style={errorBanner}>{actionError}</p>}
        <h1>{question.text}</h1>
        <div style={{ display: "grid", gap: "0.7rem" }}>
          {question.options.map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseAnswer(index)}
              style={{ ...optionButton, ...(question.selectedIndex === index ? selectedOption : {}) }}
            >
              {option}
            </button>
          ))}
        </div>
        <div style={controls}>
          <button type="button" disabled={current === 0} onClick={() => setCurrent(current - 1)} style={button}>Previous</button>
          {current < attempt.questions.length - 1 ? (
            <button type="button" onClick={() => setCurrent(current + 1)} style={button}>Next</button>
          ) : (
            <button type="button" onClick={submitExam} disabled={busy} style={button}>{busy ? "Submitting..." : "Submit exam"}</button>
          )}
        </div>
      </section>
    </main>
  );
}

const shell = { minHeight: "100dvh", background: "var(--cream-50)", padding: "5vh 6vw" } as const;
const panel = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.5rem", margin: "0 auto" } as const;
const eyebrow = { color: "var(--gold-600)", fontWeight: 600 } as const;
const topbar = { display: "flex", justifyContent: "space-between", marginBottom: "2rem", color: "var(--ink-600)" } as const;
const optionButton = { background: "#fff", border: "1px solid var(--line)", borderRadius: 4, padding: "0.9rem 1rem", textAlign: "left", cursor: "pointer", fontSize: "1rem" } as const;
const selectedOption = { borderColor: "var(--burgundy-900)", background: "#f4ece8" } as const;
const controls = { display: "flex", justifyContent: "space-between", gap: "0.75rem", marginTop: "2rem" } as const;
const button = { display: "inline-block", background: "var(--burgundy-900)", color: "#fff", border: 0, borderRadius: 4, padding: "0.7rem 1rem", textDecoration: "none", cursor: "pointer" } as const;
const errorBanner = { background: "#f2e3e0", color: "var(--danger)", padding: "0.75rem 1rem", borderRadius: 4, marginBottom: "1.25rem", fontSize: "0.9rem" } as const;
const warningBannerStyle = { background: "#f1e2c2", color: "var(--burgundy-900)", padding: "0.75rem 1rem", borderRadius: 4, marginBottom: "1.25rem", fontSize: "0.9rem" } as const;
const fullscreenBanner = { background: "#f4ece8", color: "var(--burgundy-900)", padding: "0.75rem 1rem", borderRadius: 4, marginBottom: "1.25rem", fontSize: "0.85rem" } as const;
const dismissBtn = { background: "none", border: "none", textDecoration: "underline", cursor: "pointer", color: "var(--burgundy-900)", fontSize: "0.85rem", marginLeft: "0.5rem" } as const;
