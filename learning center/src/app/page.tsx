import Link from "next/link";
import { getStudentSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getStudentSession();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--burgundy-900)",
        color: "var(--cream-50)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "8vh 6vw",
          maxWidth: 640,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
          <img src="/logo.png" alt="NAKCONEL" style={{ width: 52, height: 52, objectFit: "contain" }} />
          <p
            style={{
              color: "var(--gold-200)",
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
              margin: 0,
            }}
          >
            Nakconel Examinations
          </p>
        </div>
        <h1
          style={{
            fontSize: "clamp(2.1rem, 6vw, 3.2rem)",
            fontStyle: "italic",
            fontWeight: 500,
            color: "var(--cream-50)",
            marginBottom: "1.25rem",
          }}
        >
          Where your Nakconel training becomes a result you can show for it.
        </h1>
        <p style={{ color: "var(--gold-200)", fontSize: "1.05rem", lineHeight: 1.6, marginBottom: "2.5rem" }}>
          Register for your programme, sit your assessments, and track your scores — all
          in one place.
        </p>

        <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
          {session?.role === "student" ? (
            <Link href="/dashboard" style={primaryBtn}>
              Go to my dashboard
            </Link>
          ) : (
            <Link href="/login" style={primaryBtn}>
              Log in to Portal →
            </Link>
          )}
        </div>
      </div>

      <footer
        style={{
          borderTop: "1px solid var(--line)",
          padding: "1.25rem 6vw",
          fontSize: "0.85rem",
          color: "var(--gold-200)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Nakconel &middot; Student examination portal</span>
        <Link href="/admin/login" style={{ color: "var(--gold-200)" }}>Admin</Link>
      </footer>
    </main>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "var(--gold-600)",
  color: "var(--burgundy-950)",
  padding: "0.85rem 1.5rem",
  borderRadius: 4,
  fontWeight: 600,
  textDecoration: "none",
  fontSize: "0.98rem",
};

const secondaryBtn: React.CSSProperties = {
  border: "1px solid var(--gold-400)",
  color: "var(--cream-50)",
  padding: "0.85rem 1.5rem",
  borderRadius: 4,
  fontWeight: 500,
  textDecoration: "none",
  fontSize: "0.98rem",
};
