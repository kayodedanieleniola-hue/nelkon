"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteVerificationButton({ studentDbId }: { studentDbId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this student's stored verification photo and face data? They'll be re-enrolled on their next exam.")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/students/${studentDbId}/verification`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Couldn't delete this data. Try again.");
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      style={{
        background: "transparent",
        border: "1px solid var(--danger)",
        color: "var(--danger)",
        padding: "0.4rem 0.8rem",
        borderRadius: 4,
        fontSize: "0.82rem",
        cursor: "pointer",
      }}
    >
      {busy ? "Deleting…" : "Delete verification data"}
    </button>
  );
}
