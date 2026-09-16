"use client";

/**
 * /learning/login — Passwordless login for external Nakconel training students.
 *
 * Flow:
 *  Step 1: Enter registered email → POST /api/learning/auth/request-otp
 *  Step 2: Enter 6-digit code    → POST /api/learning/auth/verify-otp
 *  On success: redirect to /learning
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
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

/* ── small reusable input ─────────────────────────────────────────────────── */
function Field({
  label, type = "text", value, onChange, placeholder, autoFocus, disabled,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; autoFocus?: boolean; disabled?: boolean;
}) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.35rem" }}>
      <label style={{ fontSize:"0.82rem", fontWeight:600, color:WINE, fontFamily:"var(--font-body)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        style={{
          padding:"0.75rem 1rem", borderRadius:10, border:`1.5px solid ${BORDER}`,
          fontSize:"1rem", color:WINE, background:disabled?"#fdf4f4":WHITE,
          outline:"none", fontFamily:"var(--font-body)",
          boxShadow:"0 1px 4px rgba(153,27,27,0.06)",
          transition:"border-color 0.15s",
        }}
        onFocus={e => (e.target.style.borderColor = GOLDD)}
        onBlur={e  => (e.target.style.borderColor = BORDER)}
      />
    </div>
  );
}

export default function LcLoginPage() {
  const router = useRouter();
  const [step,      setStep]      = useState<"email" | "otp">("email");
  const [email,     setEmail]     = useState("");
  const [firstName, setFirstName] = useState("");
  const [code,      setCode]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [resending, setResending] = useState(false);
  const [resent,    setResent]    = useState(false);

  /* ── Step 1: request OTP ─────────────────────────────────────────────── */
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/learning/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setFirstName(data.name ?? "");
      setStep("otp");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 2: verify OTP ──────────────────────────────────────────────── */
  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/learning/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed.");
        return;
      }
      router.push("/learning");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Resend code ─────────────────────────────────────────────────────── */
  async function handleResend() {
    setResending(true);
    setResent(false);
    setError("");
    try {
      const res = await fetch("/api/learning/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not resend code."); return; }
      setCode("");
      setResent(true);
    } catch {
      setError("Network error.");
    } finally {
      setResending(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <main style={{ minHeight:"100dvh", background:`linear-gradient(160deg,${WINE} 0%,${WINE2} 60%,#1a0303 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem 1rem", fontFamily:"var(--font-body)" }}>

      {/* Decorative gold circles */}
      <div style={{ position:"fixed", top:-120, right:-80, width:380, height:380, borderRadius:"50%", background:"rgba(212,168,67,0.06)", pointerEvents:"none" }} />
      <div style={{ position:"fixed", bottom:-100, left:-60, width:300, height:300, borderRadius:"50%", background:"rgba(212,168,67,0.04)", pointerEvents:"none" }} />

      <div style={{ width:"100%", maxWidth:460, background:CREAM, borderRadius:20, padding:"2.5rem 2rem", boxShadow:"0 24px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,168,67,0.15)", position:"relative" }}>

        {/* Logo + heading */}
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <Image src="/logo.png" alt="NAKCONEL" width={64} height={64} style={{ objectFit:"contain", marginBottom:"0.75rem" }} />
          <h1 style={{ margin:0, fontSize:"1.45rem", fontWeight:900, color:WINE, fontFamily:"var(--font-display)", lineHeight:1.2 }}>
            NAKCONEL<br/>
            <span style={{ fontWeight:400, fontSize:"1rem", color:MUTED }}>Learning Center</span>
          </h1>
        </div>

        {step === "email" ? (
          <>
            <p style={{ textAlign:"center", color:MUTED, fontSize:"0.9rem", marginBottom:"1.75rem", lineHeight:1.6 }}>
              Welcome! Enter your registered email to access your learning materials, live classes, and assignments.
            </p>

            <form onSubmit={handleEmailSubmit} style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
              <Field
                label="Registered Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoFocus
                disabled={loading}
              />

              {error && (
                <div style={{ background:"#fee2e2", border:`1px solid ${WINE3}`, borderRadius:8, padding:"0.65rem 0.85rem", fontSize:"0.82rem", color:WINE3, lineHeight:1.5 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                style={{
                  padding:"0.85rem", borderRadius:10, border:"none", cursor:"pointer",
                  background: loading || !email.trim() ? "#e5c889" : `linear-gradient(135deg,${GOLD},${GOLDD})`,
                  color: WINE, fontWeight:800, fontSize:"1rem", fontFamily:"var(--font-body)",
                  boxShadow: loading ? "none" : "0 4px 16px rgba(212,168,67,0.35)",
                  transition:"all 0.15s",
                }}
              >
                {loading ? "Checking…" : "Continue →"}
              </button>
            </form>

            <p style={{ textAlign:"center", fontSize:"0.78rem", color:MUTED, marginTop:"1.5rem", lineHeight:1.6 }}>
              Only registered Nakconel <strong>training students</strong> can access the Learning Center.
              Not registered yet?{" "}
              <a href="https://nakconel.com" target="_blank" rel="noopener noreferrer" style={{ color:WINE3, fontWeight:600, textDecoration:"none" }}>
                Register on the main site →
              </a>
            </p>
          </>
        ) : (
          <>
            <p style={{ textAlign:"center", color:WINE, fontSize:"1rem", fontWeight:700, marginBottom:"0.4rem" }}>
              {firstName ? `Welcome, ${firstName}! 👋` : "Check your email"}
            </p>
            <p style={{ textAlign:"center", color:MUTED, fontSize:"0.88rem", marginBottom:"1.75rem", lineHeight:1.6 }}>
              We sent a 6-digit verification code to<br/>
              <strong style={{ color:WINE }}>{email}</strong>
            </p>

            <form onSubmit={handleOtpSubmit} style={{ display:"flex", flexDirection:"column", gap:"1.25rem" }}>
              {/* OTP input */}
              <div style={{ display:"flex", flexDirection:"column", gap:"0.35rem" }}>
                <label style={{ fontSize:"0.82rem", fontWeight:600, color:WINE, fontFamily:"var(--font-body)" }}>
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  disabled={loading}
                  style={{
                    padding:"0.85rem 1rem", borderRadius:10, border:`1.5px solid ${BORDER}`,
                    fontSize:"1.8rem", fontWeight:900, letterSpacing:"0.45em",
                    color:WINE, background:WHITE, outline:"none", textAlign:"center",
                    fontFamily:"var(--font-body)",
                  }}
                  onFocus={e => (e.target.style.borderColor = GOLDD)}
                  onBlur={e  => (e.target.style.borderColor = BORDER)}
                />
              </div>

              {error && (
                <div style={{ background:"#fee2e2", border:`1px solid ${WINE3}`, borderRadius:8, padding:"0.65rem 0.85rem", fontSize:"0.82rem", color:WINE3 }}>
                  {error}
                </div>
              )}
              {resent && (
                <div style={{ background:"#dcfce7", border:"1px solid #16a34a", borderRadius:8, padding:"0.65rem 0.85rem", fontSize:"0.82rem", color:"#15803d" }}>
                  ✓ New code sent to your email.
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                style={{
                  padding:"0.85rem", borderRadius:10, border:"none", cursor:"pointer",
                  background: loading || code.length !== 6 ? "#e5c889" : `linear-gradient(135deg,${GOLD},${GOLDD})`,
                  color:WINE, fontWeight:800, fontSize:"1rem", fontFamily:"var(--font-body)",
                  boxShadow: code.length !== 6 ? "none" : "0 4px 16px rgba(212,168,67,0.35)",
                }}
              >
                {loading ? "Verifying…" : "Verify & Sign In →"}
              </button>
            </form>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"1.25rem" }}>
              <button
                type="button"
                onClick={() => { setStep("email"); setCode(""); setError(""); }}
                style={{ background:"transparent", border:"none", color:MUTED, fontSize:"0.82rem", cursor:"pointer", padding:0 }}
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                style={{ background:"transparent", border:"none", color:WINE3, fontSize:"0.82rem", fontWeight:600, cursor:"pointer", padding:0 }}
              >
                {resending ? "Sending…" : "Resend code"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
