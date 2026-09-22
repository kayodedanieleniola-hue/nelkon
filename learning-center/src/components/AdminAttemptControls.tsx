"use client";

import { useState } from "react";

export default function AdminAttemptControls({ attemptId, onEnded }: { attemptId: string; onEnded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendWarning() {
    const message = prompt("Warning message to send to this student:");
    if (!message?.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/attempts/${attemptId}/warn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setSent(true);
      window.setTimeout(() => setSent(false), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Couldn't send the warning.");
    }
  }

  async function end(mode: "terminate" | "force_submit") {
    const verb = mode === "terminate" ? "terminate" : "force-submit";
    const reason = prompt(`Reason for ${verb === "terminate" ? "terminating" : "force-submitting"} this exam (required):`);
    if (!reason?.trim()) return;
    if (!confirm(`Are you sure you want to ${verb} this exam? This cannot be undone.`)) return;

    setBusy(true);
    const res = await fetch(`/api/admin/attempts/${attemptId}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, reason: reason.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      onEnded();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Couldn't ${verb} this exam.`);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
      <button type="button" onClick={sendWarning} disabled={busy} style={warnBtn}>
        {sent ? "Warning sent" : "Send warning"}
      </button>
      <button type="button" onClick={() => end("force_submit")} disabled={busy} style={neutralBtn}>
        Force submit
      </button>
      <button type="button" onClick={() => end("terminate")} disabled={busy} style={dangerBtn}>
        Terminate
      </button>
    </div>
  );
}

const baseBtn = {
  border: "1px solid var(--gold-400)",
  background: "transparent",
  color: "var(--burgundy-900)",
  padding: "0.35rem 0.7rem",
  borderRadius: 4,
  fontSize: "0.8rem",
  cursor: "pointer",
} as const;
const warnBtn = { ...baseBtn, borderColor: "var(--gold-600)", color: "var(--gold-600)" } as const;
const neutralBtn = baseBtn;
const dangerBtn = { ...baseBtn, borderColor: "var(--danger)", color: "var(--danger)" } as const;
