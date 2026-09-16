import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Separate cookies per role — this is deliberate. Logging in as a student
// in one tab must never silently log an admin out in another tab (or vice
// versa), which is exactly what happened when both roles shared a single
// "nak_session" cookie: whichever login happened most recently overwrote
// the other one, since a browser only keeps one value per cookie name.
const STUDENT_COOKIE = "nak_student_session";
const ADMIN_COOKIE = "nak_admin_session";
// External learning center students (verified via main Nakconel DB + OTP)
const LC_STUDENT_COOKIE = "nak_lc_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment variables."
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // internal DB id
  role: "student" | "admin";
  studentId?: string; // e.g. NAK-2026-001, only present for students
};

/** Session for external Learning Center students authenticated via OTP */
export type LcSessionPayload = {
  profileId: string;         // LearningProfile.id
  email: string;
  fullName: string;
  program: string;
  mainRegistrationId: string;
};

function cookieNameFor(role: "student" | "admin") {
  return role === "admin" ? ADMIN_COOKIE : STUDENT_COOKIE;
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const store = await cookies();
  store.set(cookieNameFor(payload.role), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

async function readSession(cookieName: string): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    // Expired or tampered token — treat as logged out rather than throwing,
    // so a bad/old cookie never crashes a page.
    return null;
  }
}

export async function getStudentSession(): Promise<SessionPayload | null> {
  const session = await readSession(STUDENT_COOKIE);
  return session?.role === "student" ? session : null;
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const session = await readSession(ADMIN_COOKIE);
  return session?.role === "admin" ? session : null;
}

/**
 * For the rare spot that genuinely doesn't care which role is logged in.
 * Prefers a student session if both happen to exist. Most code should call
 * getStudentSession()/getAdminSession() directly instead, since those are
 * explicit about which cookie — and therefore which role's identity — they
 * trust.
 */
export async function getSession(): Promise<SessionPayload | null> {
  return (await getStudentSession()) ?? (await getAdminSession());
}

export async function destroySession(role: "student" | "admin") {
  const store = await cookies();
  store.set(cookieNameFor(role), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ── Learning Center external student session ──────────────────────────────────

export async function createLcSession(payload: LcSessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());

  const store = await cookies();
  store.set(LC_STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function getLcSession(): Promise<LcSessionPayload | null> {
  const store = await cookies();
  const token = store.get(LC_STUDENT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as LcSessionPayload;
  } catch {
    return null;
  }
}

export async function destroyLcSession() {
  const store = await cookies();
  store.set(LC_STUDENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
