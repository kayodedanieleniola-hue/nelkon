import Link from "next/link";

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "var(--cream-50)",
        display: "flex",
        justifyContent: "center",
        padding: "6vh 5vw",
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "2rem",
            fontSize: "0.9rem",
            color: "var(--ink-600)",
            textDecoration: "none",
          }}
        >
          <img src="/logo.png" alt="NAKCONEL" style={{ width: 28, height: 28, objectFit: "contain" }} />
          Nakconel Examinations
        </Link>

        <p style={{ color: "var(--gold-600)", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
          {eyebrow}
        </p>
        <h1 style={{ fontSize: "1.9rem", marginBottom: "0.6rem" }}>{title}</h1>
        <p style={{ color: "var(--ink-600)", marginBottom: "2rem", lineHeight: 1.55 }}>{subtitle}</p>

        <div
          style={{
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "1.75rem",
          }}
        >
          {children}
        </div>

        {footer && <div style={{ marginTop: "1.5rem", fontSize: "0.92rem", color: "var(--ink-600)" }}>{footer}</div>}
      </div>
    </main>
  );
}
