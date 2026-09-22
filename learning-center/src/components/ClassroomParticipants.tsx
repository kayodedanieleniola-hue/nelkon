"use client";

import { useEffect, useState, useRef } from "react";
import { Room, RoomEvent, RemoteParticipant, LocalTrack, createLocalTracks } from "livekit-client";

type ParticipantInfo = {
  identity: string;
  name: string;
  isInstructor: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  isLocal: boolean;
};

export default function ClassroomParticipants({
  classId,
  room,
  canPublishVideo,
  onToggleStudentCamera,
}: {
  classId?: string;
  room: Room | null;
  canPublishVideo: boolean;
  onToggleStudentCamera: (active: boolean) => void;
}) {
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (classId) {
      try {
        const bc = new BroadcastChannel(`nak-classroom-${classId}`);
        bcRef.current = bc;
        bc.postMessage({ type: "STUDENT_JOIN", identity: "student-local", name: "Student" });
        return () => {
          bc.close();
        };
      } catch {
        // BroadcastChannel unsupported
      }
    }
  }, [classId]);

  useEffect(() => {
    if (!room) return;

    function updateRoster() {
      if (!room) return;
      const list: ParticipantInfo[] = [];

      // Local participant
      const local = room.localParticipant;
      list.push({
        identity: local.identity,
        name: local.name || local.identity,
        isInstructor: local.identity.startsWith("instructor-"),
        hasVideo: local.isCameraEnabled,
        hasAudio: local.isMicrophoneEnabled,
        isLocal: true,
      });

      // Remote participants
      for (const remote of Array.from(room.remoteParticipants.values())) {
        list.push({
          identity: remote.identity,
          name: remote.name || remote.identity,
          isInstructor: remote.identity.startsWith("instructor-"),
          hasVideo: remote.isCameraEnabled,
          hasAudio: remote.isMicrophoneEnabled,
          isLocal: false,
        });
      }

      setParticipants(list);
    }

    updateRoster();

    room.on(RoomEvent.ParticipantConnected, updateRoster);
    room.on(RoomEvent.ParticipantDisconnected, updateRoster);
    room.on(RoomEvent.TrackSubscribed, updateRoster);
    room.on(RoomEvent.TrackUnsubscribed, updateRoster);
    room.on(RoomEvent.TrackMuted, updateRoster);
    room.on(RoomEvent.TrackUnmuted, updateRoster);

    return () => {
      room.off(RoomEvent.ParticipantConnected, updateRoster);
      room.off(RoomEvent.ParticipantDisconnected, updateRoster);
      room.off(RoomEvent.TrackSubscribed, updateRoster);
      room.off(RoomEvent.TrackUnsubscribed, updateRoster);
      room.off(RoomEvent.TrackMuted, updateRoster);
      room.off(RoomEvent.TrackUnmuted, updateRoster);
    };
  }, [room]);

  // Frame broadcasting interval for student local camera mode
  useEffect(() => {
    if (!isCameraActive || !bcRef.current) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const timer = setInterval(() => {
      const video = localVideoRef.current;
      if (video && (video.readyState >= 1 || video.videoWidth > 0) && bcRef.current) {
        canvas.width = 320;
        canvas.height = 180;
        ctx?.drawImage(video, 0, 0, 320, 180);
        const frame = canvas.toDataURL("image/jpeg", 0.5);
        bcRef.current.postMessage({ type: "STUDENT_FRAME", identity: room?.localParticipant.identity || "student-local", frame });
      }
    }, 150);

    return () => clearInterval(timer);
  }, [isCameraActive, room]);

  const handleToggleRaiseHand = () => {
    const nextState = !hasRaisedHand;
    setHasRaisedHand(nextState);
    if (bcRef.current) {
      bcRef.current.postMessage({
        type: nextState ? "RAISE_HAND" : "LOWER_HAND",
        identity: room?.localParticipant.identity || "student-local",
        name: room?.localParticipant.name || "Student",
      });
    }
  };

  const localTracksRef = useRef<LocalTrack[]>([]);

  useEffect(() => {
    if (isCameraActive && localVideoRef.current && localTracksRef.current.length > 0) {
      const videoTrack = localTracksRef.current.find((t) => t.kind === "video");
      if (videoTrack) {
        videoTrack.attach(localVideoRef.current);
        void localVideoRef.current.play().catch(() => {});
      }
    }
  }, [isCameraActive]);

  const handleStartCamera = async () => {
    try {
      if (isCameraActive) {
        for (const track of localTracksRef.current) {
          track.stop();
          track.detach();
          if (room) {
            await room.localParticipant.unpublishTrack(track);
          }
        }
        localTracksRef.current = [];
        setIsCameraActive(false);
        onToggleStudentCamera(false);
      } else {
        const tracks = await createLocalTracks({ video: true, audio: true });
        localTracksRef.current = tracks;

        // Dispatch local stream for 2-way WebRTC P2P audio/video call
        try {
          const mediaTracks = tracks.map((t) => t.mediaStreamTrack);
          const stream = new MediaStream(mediaTracks);
          window.dispatchEvent(new CustomEvent("nak-student-media-stream", { detail: { stream } }));
        } catch {
          // P2P dispatch fallback
        }

        for (const track of tracks) {
          if (room) {
            await room.localParticipant.publishTrack(track);
          }
        }
        setIsCameraActive(true);
        onToggleStudentCamera(true);
      }
    } catch (err) {
      console.error("Student camera & mic broadcast error:", err);
    }
  };

  return (
    <div style={container}>
      <div style={rosterHeader}>
        <span style={countTag}>ACTIVE PARTICIPANTS ({participants.length || 1})</span>
        <button
          type="button"
          onClick={handleToggleRaiseHand}
          style={{ ...raiseHandBtn, ...(hasRaisedHand ? activeRaiseBtn : {}) }}
        >
          {hasRaisedHand ? "Hand Raised" : "Raise Hand"}
        </button>
      </div>

      {/* Camera & Microphone controls for students */}
      <div style={permissionCard}>
        <div>
          <strong style={permTitle}>{canPublishVideo ? "Video Permission Granted" : "Interactive 2-Way Call"}</strong>
          <p style={permSub}>
            {isCameraActive
              ? "Your camera and microphone are broadcasting live to instructor."
              : "Share your camera & microphone to speak live with instructor."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartCamera}
          style={{ ...camBtn, ...(isCameraActive ? stopCamBtn : startCamBtn) }}
        >
          {isCameraActive ? "Stop My Camera" : "Share My Camera & Mic"}
        </button>
      </div>

      {/* Local camera preview stage when student is sharing video */}
      {isCameraActive && (
        <div style={localCamContainer}>
          <video ref={localVideoRef} autoPlay playsInline muted style={localVideoElement} />
          <span style={localVideoLabel}>Your Camera Feed</span>
        </div>
      )}

      {/* Roster list */}
      <div style={rosterList}>
        {participants.map((p) => (
          <div key={p.identity} style={participantRow}>
            <div style={infoGroup}>
              <span style={avatarBadge}>{p.isInstructor ? "INS" : "STU"}</span>
              <div>
                <strong style={pName}>
                  {p.name} {p.isLocal ? "(You)" : ""}
                </strong>
                <div style={badgeGroup}>
                  <span style={{ ...roleBadge, ...(p.isInstructor ? instructorRole : studentRole) }}>
                    {p.isInstructor ? "Instructor" : "Student"}
                  </span>
                  <span style={statusText}>
                    {p.hasVideo ? "Video On" : "Camera Off"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const container = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
} as const;

const rosterHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const countTag = {
  color: "#98661B",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
} as const;

const permissionCard = {
  background: "#331614",
  border: "1px solid #98661B",
  borderRadius: 6,
  padding: "0.65rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.5rem",
} as const;

const permTitle = {
  color: "#ffd98a",
  fontSize: "0.82rem",
} as const;

const permSub = {
  margin: "0.15rem 0 0",
  fontSize: "0.75rem",
  color: "#a38b80",
} as const;

const camBtn = {
  borderRadius: 4,
  padding: "0.35rem 0.65rem",
  fontSize: "0.78rem",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

const startCamBtn = {
  background: "#98661B",
  color: "#fff",
  border: "none",
} as const;

const stopCamBtn = {
  background: "#4d1010",
  color: "#ff4d4d",
  border: "1px solid #ff4d4d",
} as const;

const localCamContainer = {
  position: "relative",
  background: "#100707",
  border: "1px solid #98661B",
  borderRadius: 6,
  aspectRatio: "16 / 9",
  overflow: "hidden",
} as const;

const localVideoElement = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
} as const;

const localVideoLabel = {
  position: "absolute",
  bottom: "0.4rem",
  left: "0.4rem",
  background: "rgba(0,0,0,0.7)",
  color: "#ffd98a",
  padding: "0.15rem 0.4rem",
  borderRadius: 3,
  fontSize: "0.7rem",
  fontWeight: 600,
} as const;

const rosterList = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
} as const;

const participantRow = {
  background: "#1a0d0c",
  border: "1px solid #3b2220",
  borderRadius: 6,
  padding: "0.55rem 0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const infoGroup = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
} as const;

const avatarBadge = {
  fontSize: "1.2rem",
} as const;

const pName = {
  fontSize: "0.85rem",
  color: "#fff",
} as const;

const badgeGroup = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  marginTop: "0.2rem",
} as const;

const roleBadge = {
  fontSize: "0.68rem",
  fontWeight: 700,
  padding: "0.1rem 0.35rem",
  borderRadius: 3,
} as const;

const instructorRole = {
  background: "#4d1010",
  color: "#ffd98a",
  border: "1px solid #98661B",
} as const;

const studentRole = {
  background: "#2e1615",
  color: "#c2aba0",
} as const;

const statusText = {
  fontSize: "0.72rem",
  color: "#8c766b",
} as const;

const raiseHandBtn = {
  background: "#331614",
  border: "1px solid #98661B",
  color: "#ffd98a",
  borderRadius: 4,
  padding: "0.2rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const activeRaiseBtn = {
  background: "#98661B",
  color: "#fff",
} as const;
