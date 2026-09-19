"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LcLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/learning/auth/logout", { method: "POST" });
    } catch { /* ignore */ }
    router.push("/learning/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        background: "transparent",
        border: "1px solid var(--burgundy-300, #fca5a5)",
        color: "var(--burgundy-700, #7f1d1d)",
        borderRadius: 6,
        padding: "0.38rem 0.85rem",
        fontSize: "0.85rem",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
