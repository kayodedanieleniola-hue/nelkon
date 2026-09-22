import type { CSSProperties } from "react";

export const label: CSSProperties = {
  display: "block",
  fontSize: "0.88rem",
  fontWeight: 600,
  color: "var(--ink-900)",
  marginBottom: "0.35rem",
};

export const input: CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  border: "1px solid #d8cdbf",
  borderRadius: 4,
  background: "#fff",
  color: "var(--ink-900)",
};

export const fieldGroup: CSSProperties = {
  marginBottom: "1.1rem",
};

export const submitButton: CSSProperties = {
  width: "100%",
  background: "var(--gold-600)",
  color: "var(--burgundy-950)",
  fontWeight: 600,
  padding: "0.8rem 1rem",
  borderRadius: 4,
  border: "none",
  cursor: "pointer",
  marginTop: "0.4rem",
};

export const errorText: CSSProperties = {
  color: "var(--danger)",
  fontSize: "0.9rem",
  marginBottom: "1rem",
};

export const helpText: CSSProperties = {
  fontSize: "0.82rem",
  color: "var(--ink-600)",
  marginTop: "0.3rem",
};
