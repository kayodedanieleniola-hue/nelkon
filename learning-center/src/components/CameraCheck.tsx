"use client";

import { useEffect, useRef, useState } from "react";
import { createLocalTracks, Room, RoomEvent, VideoPresets } from "livekit-client";

const MODELS_URL = "/models";
const PRESENCE_CHECK_INTERVAL_MS = 25_000;

async function reportEvent(attemptId: string, body: object) {
  try {
    await fetch(`/api/attempts/${attemptId}/monitor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Monitoring is a best-effort layer — never let a failed report affect
    // the exam itself.
  }
}

export default function CameraCheck({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<"connecting" | "reconnecting" | "ready" | "blocked">("connecting");
  const [consented, setConsented] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [verification, setVerification] = useState<"idle" | "checking" | "baseline_set" | "match" | "mismatch">("idle");

  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  useEffect(() => {
    let active = true;
    let currentRoom: Room | null = null;

    if (!consented) {
      setStatus("connecting");
      return () => { active = false; };
    }

    async function connectAndPublish() {
      const room = new Room();
      currentRoom = room;
      roomRef.current = room;

      // LiveKit's client already has its own robust reconnection built in —
      // the "resuming signal connection" / "reconnecting, attempt: N" /
      // back to "connected" sequence visible in the console on a network
      // blip is that working correctly on its own, including automatically
      // republishing tracks. Layering a second, custom "tear it all down
      // and reconnect from scratch" system on top of that (an earlier
      // version of this file did exactly that) meant two reconnection
      // systems fighting over the same connection: our reconnect could fire
      // while LiveKit's own retry was still mid-flight, each side looking
      // like a "new" duplicate connection to the server, which kicked one
      // out, which retriggered our reconnect — an infinite loop. The fix is
      // to not compete with it at all: just reflect what the SDK is already
      // doing in the UI, and only treat it as truly unavailable if the SDK
      // itself gives up (Disconnected firing after its own retries fail).
      room.on(RoomEvent.Reconnecting, () => {
        if (active) setStatus("reconnecting");
      });
      room.on(RoomEvent.Reconnected, () => {
        if (active) setStatus("ready");
      });
      room.on(RoomEvent.Disconnected, () => {
        if (!active) return; // Our own cleanup caused this — not a failure.
        setStatus("blocked");
        void reportEvent(attemptId, { type: "camera", event: "disconnected" });
      });

      try {
        const response = await fetch(`/api/livekit/token?attemptId=${encodeURIComponent(attemptId)}&viewer=student`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Live video is unavailable");
        await room.connect(data.url, data.token);
        // Request 4K when the camera and connection support it. Browsers and
        // LiveKit will negotiate a lower layer when 4K is unavailable or the
        // available network cannot sustain it.
        const tracks = await createLocalTracks({ video: { resolution: VideoPresets.h2160.resolution, frameRate: 20 }, audio: true });
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track, track.kind === "video" ? { videoEncoding: VideoPresets.h2160.encoding } : undefined);
        }
        const videoTrack = tracks.find((track) => track.kind === "video");
        if (active && videoTrack && videoRef.current) {
          videoTrack.attach(videoRef.current);
          // LiveKit's attach() already tries to auto-play, but mobile
          // browsers frequently block that silently — the element ends up
          // "connected" with a stream attached but no frames ever actually
          // rendering (just its background color showing through). This
          // explicit play() call, with a visible fallback if it's rejected,
          // is how we detect and recover from that instead of leaving a
          // blank box with no indication anything's wrong.
          try {
            await videoRef.current.play();
            setNeedsTapToPlay(false);
          } catch {
            setNeedsTapToPlay(true);
          }
        }
        if (active) setStatus("ready");
      } catch {
        if (active) setStatus("blocked");
        void reportEvent(attemptId, { type: "camera", event: "blocked" });
        await room.disconnect();
      }
    }

    void connectAndPublish();

    return () => {
      active = false;
      currentRoom?.localParticipant.trackPublications.forEach((publication) => publication.track?.stop());
      void currentRoom?.disconnect();
    };
  }, [attemptId, consented]);

  const identityCheckedRef = useRef(false);

  // Identity check + periodic presence checks. Runs entirely in the
  // browser (models are self-hosted in /public/models, nothing sent to a
  // third party); only the resulting event — matched/mismatched, or a
  // face count — is sent to the server. This is a review-flag layer, not
  // an enforcement layer: nothing here blocks the exam.
  useEffect(() => {
    if (status !== "ready" || !videoRef.current) return;
    let cancelled = false;
    let presenceTimer: number | undefined;

    async function run() {
      const faceapi = await import("@vladmandic/face-api");
      if (cancelled) return;
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
        ]);
      } catch {
        return; // Slow/blocked network — skip monitoring, exam continues normally.
      }
      if (cancelled || !videoRef.current) return;

      // One-time identity check per exam session — a reconnect (status
      // briefly leaving and returning to "ready") must not re-trigger this,
      // or a shaky connection would spam repeated identity checks.
      if (!identityCheckedRef.current) {
        identityCheckedRef.current = true;
        setVerification("checking");
        try {
          const video = videoRef.current;
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (detection && !cancelled) {
            const canvas = document.createElement("canvas");
            canvas.width = 160;
            canvas.height = 120;
            canvas.getContext("2d")?.drawImage(video, 0, 0, 160, 120);
            const photo = canvas.toDataURL("image/jpeg", 0.6);

            const res = await fetch(`/api/attempts/${attemptId}/monitor`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "identity", descriptor: Array.from(detection.descriptor), photo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!cancelled) setVerification(data.status ?? "idle");
          } else if (!cancelled) {
            setVerification("idle");
          }
        } catch {
          if (!cancelled) setVerification("idle");
        }
      }

      // Periodic presence checks — lightweight face count only.
      let lastCategory: "none" | "one" | "many" | null = null;
      presenceTimer = window.setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions());
          const count = detections.length;
          const category = count === 0 ? "none" : count === 1 ? "one" : "many";
          if (category !== lastCategory) {
            lastCategory = category;
            void reportEvent(attemptId, { type: "presence", facesDetected: count });
          }
        } catch {
          // Skip this tick silently.
        }
      }, PRESENCE_CHECK_INTERVAL_MS);
    }

    void run();
    return () => {
      cancelled = true;
      if (presenceTimer) window.clearInterval(presenceTimer);
    };
  }, [status, attemptId]);

  return (
    <aside style={panel} aria-label="Camera and microphone check">
      <div style={heading}>
        <strong>Camera and microphone</strong>
        <span style={{ color: status === "ready" ? "var(--success)" : status === "reconnecting" ? "var(--gold-600)" : "var(--danger)" }}>
          {status === "ready" ? "Transmitting" : status === "reconnecting" ? "Reconnecting" : status === "connecting" ? "Connecting" : "Unavailable"}
        </span>
      </div>

      {!consented && (
        <div style={consentBox}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            This exam requires camera and microphone monitoring.{" "}
            <button type="button" onClick={() => setShowDetails((v) => !v)} style={linkBtn}>
              {showDetails ? "Hide details" : "What does this involve?"}
            </button>
          </p>
          {showDetails && (
            <ul style={detailsList}>
              <li>Your camera and microphone stream live to your exam administrator while you test — nothing is recorded to a file.</li>
              <li>A one-time face check confirms you're the enrolled student; later checks watch only for &quot;no face&quot; or &quot;more than one face&quot; in view.</li>
              <li>These checks create review flags for a human admin — they never automatically fail or block you.</li>
              <li>Your reference face data is stored only as a non-reversible numeric comparison value, plus one small photo, both deletable on request by an admin.</li>
            </ul>
          )}
          <label style={consentLabel}>
            <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
            I consent to camera and microphone monitoring while taking this exam.
          </label>
        </div>
      )}

      {/* Always mounted once consented — never conditionally rendered on
          status. It used to only render when status==="ready", but the
          track gets attached to this element BEFORE status flips to
          "ready" (see connectAndPublish above), so the element didn't
          exist yet at attach time and the attach was silently skipped.
          The status could say "Transmitting" while nothing was actually
          attached to any video element. Keeping it always in the DOM
          (just visually hidden until ready) means videoRef.current is
          always available when attach() runs, on the first connect and
          on every reconnect. */}
      {consented && (
        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ ...video, display: status === "ready" ? "block" : "none" }}
          />
          {status === "ready" && needsTapToPlay && (
            <button
              type="button"
              onClick={() => {
                videoRef.current?.play().then(() => setNeedsTapToPlay(false)).catch(() => {});
              }}
              style={tapToPlayBtn}
            >
              Tap to view your camera
            </button>
          )}
        </div>
      )}

      <p style={help}>
        {status === "ready"
          ? verification === "mismatch"
            ? "Your camera is transmitting. The identity check flagged this session for admin review."
            : "Your camera and microphone are transmitting for this exam."
          : status === "reconnecting"
          ? "Connection dropped briefly — reconnecting automatically. This can happen after switching apps or tabs."
          : status === "blocked"
          ? "Camera or microphone permission was not granted. Allow both in your browser and reload the exam."
          : consented
          ? "Allow camera and microphone access when your browser asks."
          : "Consent is required before camera and microphone access can begin."}
      </p>
    </aside>
  );
}

const panel = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "0.9rem", marginBottom: "1rem" } as const;
const heading = { display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.9rem" } as const;
const video = { display: "block", width: "100%", maxWidth: 220, aspectRatio: "16 / 9", objectFit: "cover", background: "var(--ink-900)", borderRadius: 4, marginTop: "0.7rem" } as const;
const help = { color: "var(--ink-600)", fontSize: "0.8rem", margin: "0.55rem 0 0" } as const;
const consentBox = { marginTop: "0.6rem" } as const;
const consentLabel = { display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.85rem" } as const;
const linkBtn = { background: "none", border: "none", color: "var(--gold-600)", fontWeight: 600, cursor: "pointer", padding: 0, fontSize: "0.85rem", textDecoration: "underline" } as const;
const detailsList = { fontSize: "0.8rem", color: "var(--ink-600)", margin: "0 0 0.75rem", paddingLeft: "1.1rem", display: "grid", gap: "0.3rem" } as const;
const tapToPlayBtn = {
  position: "absolute",
  inset: 0,
  marginTop: "0.7rem",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600,
} as const;
