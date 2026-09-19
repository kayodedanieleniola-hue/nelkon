"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StatusToggleButton({
  studentDbId,
  status,
}: {
  studentDbId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = status === "active" ? "disabled" : "active";
    await fetch(`/api/admin/students/${studentDbId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        background: status === "active" ? "transparent" : "var(--gold-600)",
        color: status === "active" ? "var(--danger)" : "var(--burgundy-950)",
        border: status === "active" ? "1px solid var(--danger)" : "none",
        padding: "0.55rem 1.1rem",
        borderRadius: 4,
        fontWeight: 600,
        fontSize: "0.9rem",
        cursor: "pointer",
      }}
    >
      {loading ? "Working…" : status === "active" ? "Disable account" : "Activate account"}
    </button>
  );
}
