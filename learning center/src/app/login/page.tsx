"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

/* ── palette ──────────────────────────────────────────────────────────────── */
const WINE   = "#330808";
const WINE2  = "#4a1010";
const WINE3  = "#991b1b";
const GOLD   = "#d4a843";
const GOLDD  = "#b8922f";
const WHITE  = "#ffffff";
const CREAM  = "#fff8f8";
const MUTED  = "#9b5c5c";
const BORDER = "#fde8e8";

export default function LoginPage() {
  const router = useRouter();
  const [email,      setEmail]      = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight:"100dvh", background:`linear-gradient(160deg,${WINE} 0%,${WINE2} 60%,#1a0303 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem 1rem", fontFamily:"var(--font-body)" }}>

      {/* Decorative gold circles */}
      <div style={{ position:"fixed", top:-120, right:-80, width:380, height:380, borderRadius:"50%", background:"rgba(212,168,67,0.06)", pointerEvents:"none" }}/>
      <div style={{ position:"fixed", bottom:-100, left:-60, width:300, height:300, borderRadius:"50%", background:"rgba(212,168,67,0.04)", pointerEvents:"none" }}/>

      <div style={{ width:"100%", maxWidth:440, background:CREAM, borderRadius:20, padding:"2.5rem 2rem", boxShadow:"0 24px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,168,67,0.15)", position:"relative" }}>

        {/* Logo + heading */}
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <Image src="/logo.png" alt="NAKCONEL" width={60} height={60} style={{ objectFit:"contain", marginBottom:"0.75rem" }} />
          <h1 style={{ margin:0, fontSize:"1.5rem", fontWeight:900, color:WINE, fontFamily:"var(--font-display)", lineHeight:1.2 }}>
            Student Sign In
          </h1>
          <p style={{ margin:"0.5rem 0 0", color:MUTED, fontSize:"0.88rem" }}>
            Nakconel Examinations Portal
          </p>
        </div>

        <p style={{ color:MUTED, fontSize:"0.88rem", lineHeight:1.6, marginBottom:"1.75rem", textAlign:"center" }}>
          Enter your registered Nakconel training email to access your exams and results.
        </p>

        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
          {/* Email field */}
          <div style={{ display:"flex", flexDirection:"column", gap:"0.35rem" }}>
            <label htmlFor="email" style={{ fontSize:"0.82rem", fontWeight:600, color:WINE }}>
              Registered Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
              style={{
                padding:"0.75rem 1rem", borderRadius:10, border:`1.5px solid ${BORDER}`,
                fontSize:"1rem", color:WINE, background:submitting?"#fdf4f4":WHITE,
                outline:"none", fontFamily:"var(--font-body)",
                boxShadow:"0 1px 4px rgba(153,27,27,0.06)",
                transition:"border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = GOLDD)}
              onBlur={e  => (e.target.style.borderColor = BORDER)}
            />
          </div>

          {/* Error message */}
          {error && (
            <div style={{ background:"#fee2e2", border:`1px solid ${WINE3}`, borderRadius:8, padding:"0.75rem 0.9rem", fontSize:"0.83rem", color:WINE3, lineHeight:1.55 }}>
              {error}
              {/* Show registration link if the error mentions nakconel.company */}
              {error.includes("nakconel.company") && (
                <div style={{ marginTop:"0.5rem" }}>
                  <a
                    href="https://nakconel.company"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color:WINE, fontWeight:700, textDecoration:"underline" }}
                  >
                    Register at nakconel.company →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            style={{
              padding:"0.88rem", borderRadius:10, border:"none", cursor:"pointer",
              background: submitting || !email.trim()
                ? "#e5c889"
                : `linear-gradient(135deg,${GOLD},${GOLDD})`,
              color:WINE, fontWeight:800, fontSize:"1rem", fontFamily:"var(--font-body)",
              boxShadow: submitting || !email.trim() ? "none" : "0 4px 16px rgba(212,168,67,0.35)",
              transition:"all 0.15s",
            }}
          >
            {submitting ? "Checking…" : "Sign In →"}
          </button>
        </form>

        {/* Footer */}
        <p style={{ textAlign:"center", fontSize:"0.75rem", color:MUTED, marginTop:"1.5rem" }}>
          <Link href="/admin/login" style={{ color:MUTED, textDecoration:"none" }}>
            Admin sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
