"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteStudentButton({ studentDbId, studentName }: { studentDbId: string; studentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function removeAccount() {
    if (!confirm(`Delete ${studentName}'s account permanently? Their exam attempts, assignment submissions, attendance, and verification data will also be removed. This cannot be undone.`)) return;
    setBusy(true);
    const response = await fetch(`/api/admin/students/${studentDbId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error ?? "Could not delete this student account.");
      setBusy(false);
      return;
    }
    router.push("/admin/students");
    router.refresh();
  }

  return <button type="button" onClick={removeAccount} disabled={busy} style={{ background:"var(--danger)", color:"#fff", border:"none", padding:"0.55rem 1.1rem", borderRadius:4, fontWeight:600, fontSize:"0.9rem", cursor:busy?"wait":"pointer" }}>
    {busy ? "Deleting…" : "Delete account"}
  </button>;
}
