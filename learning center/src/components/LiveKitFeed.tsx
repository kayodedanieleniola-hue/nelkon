"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

export default function LiveKitFeed({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState("Connecting...");
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  useEffect(() => {
    let active = true;
    let currentRoom: Room | null = null;

    async function connect() {
      // Monitoring cards are compact, but adaptive streaming chooses a low
      // layer from the rendered card size. Subscribe to the best available
      // layer so the admin receives the clearer exam-review feed.
      const room = new Room({ adaptiveStream: false });
      currentRoom = room;

      room.on(RoomEvent.TrackSubscribed, async (track) => {
        if (!active) return;
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          // Same autoplay caveat as the student side: attach() tries to
          // play automatically but browsers can silently block it, leaving
          // a "connected" feed with nothing actually rendering. This makes
          // that failure visible and recoverable with one tap.
          try {
            await videoRef.current.play();
            setNeedsTapToPlay(false);
          } catch {
            setNeedsTapToPlay(true);
          }
        }
        if (track.kind === Track.Kind.Audio && audioRef.current) track.attach(audioRef.current);
        setStatus("Connected");
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach());

      // Trust LiveKit's own reconnection handling rather than layering a
      // second one on top of it — see the long comment in CameraCheck.tsx
      // for why a custom "tear down and reconnect from scratch" system
      // caused real bugs (it raced against the SDK's own retry and caused
      // duplicate-identity kicks). Just reflect the SDK's state here.
      room.on(RoomEvent.Reconnecting, () => {
        if (active) setStatus("Reconnecting...");
      });
      room.on(RoomEvent.Reconnected, () => {
        if (active) setStatus("Connected");
      });
      room.on(RoomEvent.Disconnected, () => {
        if (active) setStatus("Connection lost — the student may no longer be in this exam");
      });

      try {
        const response = await fetch(`/api/livekit/token?attemptId=${encodeURIComponent(attemptId)}&viewer=admin`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to connect");
        await room.connect(data.url, data.token);
      } catch (error) {
        console.error("LiveKitFeed connect failed:", error);
        if (active) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === "string"
              ? error
              : `Unknown error: ${JSON.stringify(error)}`;
          setStatus(`Unavailable — ${message}`);
        }
      }
    }

    void connect();
    return () => {
      active = false;
      currentRoom?.removeAllListeners();
      void currentRoom?.disconnect();
    };
  }, [attemptId]);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <video ref={videoRef} autoPlay playsInline style={video} />
        {needsTapToPlay && (
          <button
            type="button"
            onClick={() => {
              videoRef.current?.play().then(() => setNeedsTapToPlay(false)).catch(() => {});
            }}
            style={tapToPlayBtn}
          >
            Tap to view feed
          </button>
        )}
      </div>
      <audio ref={audioRef} autoPlay controls style={audio} />
      <p style={help}>{status}</p>
    </div>
  );
}

const video = { display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "var(--ink-900)", borderRadius: 4 } as const;
const audio = { width: "100%", marginTop: "0.5rem" } as const;
const help = { color: "var(--ink-600)", fontSize: "0.8rem" } as const;
const tapToPlayBtn = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
} as const;
