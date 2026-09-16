"use client";

/**
 * GeneralClassroomClient — NAKCONEL Learning Center
 * Mobile layout matches the design mockup.
 * Desktop keeps the original side-panel layout.
 * All LiveKit logic is unchanged.
 *
 * CAMERA FIX: One hidden <video> element (hiddenSelfRef) holds the LiveKit
 * track at all times. Visible self-tile <video> elements mirror its srcObject
 * via a useEffect so the same stream appears in whichever tile is visible —
 * without fighting over a shared ref.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  Room, RoomEvent, Track,
  RemoteParticipant, RemoteTrackPublication,
  createLocalTracks, createLocalScreenTracks, type LocalTrack,
} from "livekit-client";
import ClassroomChat from "@/components/ClassroomChat";

/* ─── tokens ─────────────────────────────────────────────────────────────── */
const BG        = "#110505";
const SURFACE   = "#1c0808";
const CARD      = "#250d0d";
const CARD2     = "#1a1a1a";
const RIM       = "#341414";
const WINE      = "#6b1f1f";
const GOLD      = "#e8b84b";
const GOLD_DIM  = "#c49a2e";
const GOLD_GLOW = "rgba(232,184,75,0.20)";
const WHITE     = "#ffffff";
const OFF_WHITE = "#f8f5f2";
const PANEL_BDR = "#e5e0db";
const MUTED_TXT = "#9a8070";
const INK       = "#180808";
const RED       = "#e53535";
const MIC_ON    = "#22c55e";
const MIC_OFF   = "#e53535";
const PANEL_BG  = "#141414";
const PANEL_HDR = "#1e1e1e";

/* ─── SVG icons ──────────────────────────────────────────────────────────── */
const Mic = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/>
    <line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);
const MicOff = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22"/>
    <path d="M18.89 13.23A7 7 0 0 0 19 12"/><path d="M5 10a7 7 0 0 0 11.64 5.23"/>
    <path d="M15 9.34V6a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
    <line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
  </svg>
);
const Cam = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 7 16 12 23 17z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
  </svg>
);
const CamOff = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);
const People = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const ChatIcon = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const QAIcon = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const MaterialsIcon = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
  </svg>
);
const More = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={c} stroke="none">
    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
  </svg>
);
const PhoneOff = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07"/>
    <path d="M14.5 2.23a19.79 19.79 0 0 0-8.63-3.07A2 2 0 0 0 3.69 1.15"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);
const Present = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);
const Bell = ({ s=18, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);
const Search = ({ s=15, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const Send = ({ s=15, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const ChevronUp = ({ s=16, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
);
const ChevronDown2 = ({ s=16, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const BackArrow = ({ s=20, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const ExpandIcon = ({ s=14, c="currentColor" }: { s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

/* ─── Logo ───────────────────────────────────────────────────────────────── */
function NakLogo({ light=false, compact=false }: { light?: boolean; compact?: boolean }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.45rem" }}>
      {/* Company unicorn logo */}
      <img
        src="/logo.png"
        alt="NAKCONEL"
        style={{ width:compact?26:34, height:compact?26:34, objectFit:"contain", flexShrink:0, filter:"drop-shadow(0 1px 4px rgba(232,184,75,0.4))" }}
      />
      <div style={{ lineHeight:1.1 }}>
        <div style={{ color:light?WHITE:INK, fontWeight:900, fontSize:compact?"0.72rem":"0.88rem", letterSpacing:"0.04em" }}>NAKCONEL</div>
        <div style={{ color:light?"rgba(255,255,255,0.45)":MUTED_TXT, fontSize:"0.46rem", letterSpacing:"0.08em", textTransform:"uppercase" }}>Learning Center</div>
      </div>
    </div>
  );
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
type Meeting = { id: string; title: string; instructor: string|null; description: string|null; status: string };
type PTile   = { identity: string; name: string; videoPub: RemoteTrackPublication|null; audioPub: RemoteTrackPublication|null };

/* ─── Remote video tile ──────────────────────────────────────────────────── */
function RemoteTile({ tile, large=false, compact=false }: { tile: PTile; large?: boolean; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const isHost   = tile.identity.startsWith("instructor-");
  const videoTrack = tile.videoPub?.track;
  const audioTrack = tile.audioPub?.track;
  const micLive  = !!audioTrack;
  const camLive  = !!videoTrack;
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!videoTrack || !el) return;
    videoTrack.attach(el);
    void el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!audioTrack || !el) return;
    audioTrack.attach(el);
    void el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    return () => {
      audioTrack.detach(el);
    };
  }, [audioTrack]);

  const sz = large ? 56 : compact ? 28 : 38;
  return (
    <div style={{ position:"relative", borderRadius:large?12:8, overflow:"hidden", background:CARD2, border:isHost?`2px solid ${GOLD}`:"1px solid rgba(255,255,255,0.08)", width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:camLive?"block":"none" }}/>
      {!camLive && (
        <div style={{ width:sz, height:sz, borderRadius:"50%", background:isHost?`linear-gradient(135deg,${GOLD},#f6de88)`:`linear-gradient(135deg,#2a2a2a,#3a3a3a)`, color:isHost?INK:WHITE, display:"flex", alignItems:"center", justifyContent:"center", fontSize:large?"1.5rem":compact?"0.85rem":"1.1rem", fontWeight:800 }}>
          {tile.name.charAt(0).toUpperCase()}
        </div>
      )}
      <audio ref={audioRef} autoPlay style={{ position:"absolute", width:0, height:0, opacity:0, pointerEvents:"none" }}/>
      {isHost && large && (
        <div style={{ position:"absolute", top:"0.4rem", left:"0.4rem", background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)", borderRadius:5, padding:"0.15rem 0.45rem", fontSize:"0.62rem", color:WHITE, fontWeight:600 }}>Instructor</div>
      )}
      {large && (
        <div style={{ position:"absolute", top:"0.4rem", right:"0.4rem", background:"rgba(0,0,0,0.5)", borderRadius:5, padding:"0.2rem", display:"flex" }}><ExpandIcon s={13} c={WHITE}/></div>
      )}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(to top,rgba(0,0,0,0.75),transparent)", padding:large?"1.5rem 0.6rem 0.45rem":compact?"0.6rem 0.35rem 0.25rem":"0.9rem 0.45rem 0.3rem", display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <span style={{ color:WHITE, fontSize:large?"0.82rem":compact?"0.6rem":"0.72rem", fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{tile.name}</span>
        <div style={{ display:"flex", gap:"0.2rem" }}>
          <div style={{ width:large?24:compact?16:20, height:large?24:compact?16:20, borderRadius:"50%", background:micLive?"rgba(34,197,94,0.25)":"rgba(229,53,53,0.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {micLive ? <Mic s={large?12:compact?8:10} c={MIC_ON}/> : <MicOff s={large?12:compact?8:10} c={WHITE}/>}
          </div>
          {large && (
            <div style={{ width:24, height:24, borderRadius:"50%", background:camLive?"rgba(34,197,94,0.25)":"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {camLive ? <Cam s={12} c={MIC_ON}/> : <CamOff s={12} c="rgba(255,255,255,0.5)"/>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Self video tile — mirrors stream from hiddenSelfRef ────────────────── */
function SelfVideoTile({
  hiddenSrc,
  micOn,
  studentName,
  cameraOn,
  refreshToken,
  videoTrack,
  compact = false,
  showExpandIcon = false,
}: {
  hiddenSrc: MediaStream | null;
  micOn: boolean;
  studentName: string;
  cameraOn: boolean;
  refreshToken: number;
  videoTrack: LocalTrack | null;
  compact?: boolean;
  showExpandIcon?: boolean;
}) {
  const vidRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = vidRef.current;
    if (!el) return;
    // Let LiveKit attach the actual local video track. This reliably resumes
    // the self-preview after mute/unmute in Chromium browsers.
    if (videoTrack?.kind === Track.Kind.Video) {
      videoTrack.attach(el);
      void el.play().catch(() => {});
      return () => { videoTrack.detach(el); };
    }
    if (!hiddenSrc) return;
    el.srcObject = null;
    el.srcObject = hiddenSrc;
    void el.play().catch(() => {});
  }, [hiddenSrc, videoTrack, refreshToken, cameraOn]);

  const showing = !!hiddenSrc && cameraOn;
  const sz = compact ? 26 : 44;

  return (
    <>
      <video ref={vidRef} autoPlay playsInline muted
        style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", display:showing?"block":"none" }}/>
      {!showing && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:sz, height:sz, borderRadius:"50%", background:`linear-gradient(135deg,${GOLD},#f6de88)`, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontSize:compact?"0.8rem":"1.1rem", fontWeight:800 }}>
            {studentName.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      {showExpandIcon && (
        <div style={{ position:"absolute", top:"0.4rem", right:"0.4rem", background:"rgba(0,0,0,0.5)", borderRadius:5, padding:"0.2rem", display:"flex" }}><ExpandIcon s={12} c={WHITE}/></div>
      )}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(to top,rgba(0,0,0,0.75),transparent)", padding:compact?"0.6rem 0.35rem 0.25rem":"0.9rem 0.5rem 0.3rem", display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <span style={{ color:WHITE, fontSize:compact?"0.6rem":"0.72rem", fontWeight:700 }}>{compact?"You":studentName}</span>
        <div style={{ width:compact?16:20, height:compact?16:20, borderRadius:"50%", background:micOn?"rgba(34,197,94,0.25)":"rgba(229,53,53,0.7)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {micOn ? <Mic s={compact?8:10} c={MIC_ON}/> : <MicOff s={compact?8:10} c={WHITE}/>}
        </div>
      </div>
    </>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function GeneralClassroomClient({ meeting, studentName, isInstructor = false, backHref = "/learning", onLeave }: {
  meeting: Meeting;
  studentName: string;
  isInstructor?: boolean;
  backHref?: string;
  onLeave?: () => void;
}) {
  const roomRef      = useRef<Room|null>(null);
  const activeRef    = useRef(true);

  /* CAMERA FIX: single hidden video element always mounted — the LiveKit track
     attaches here once and never gets unmounted. Visible tiles mirror srcObject. */
  const hiddenSelfRef = useRef<HTMLVideoElement|null>(null);
  const [selfStream,  setSelfStream]  = useState<MediaStream|null>(null);

  const [connStatus,   setConnStatus]   = useState<"connecting"|"live"|"error">("connecting");
  const [activeRoom,   setActiveRoom]   = useState<Room|null>(null);
  const [cameraReady,  setCameraReady]  = useState(false);
  const [cameraRefresh, setCameraRefresh] = useState(0);
  const [cameraError,  setCameraError]  = useState("");
  const [micOn,        setMicOn]        = useState(true);
  const [camOn,        setCamOn]        = useState(true);
  const [activeTab,    setActiveTab]    = useState<"participants"|"chat"|"qa"|"materials">("participants");
  const [panelOpen,    setPanelOpen]    = useState(true);
  const [participants, setParticipants] = useState<Record<string, PTile>>({});
  const [elapsed,      setElapsed]      = useState(0);
  const [isMobile,     setIsMobile]     = useState(false);
  const localVideoTrack = useRef<LocalTrack|null>(null);
  const localAudioTrack = useRef<LocalTrack|null>(null);
  const screenTracks = useRef<LocalTrack[]>([]);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isHandRaised,  setIsHandRaised]  = useState(false);
  const [raisedHands,   setRaisedHands]   = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);

  const bcRef = useRef<BroadcastChannel|null>(null);
  const [muteNotice, setMuteNotice] = useState<string|null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout|null>(null);

  const triggerNotification = useCallback((text: string) => {
    setMuteNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setMuteNotice(null);
    }, 4500);
  }, []);

  const toggleRaiseHand = useCallback(() => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    const myId = roomRef.current?.localParticipant?.identity || "user-" + Math.random().toString(36).substring(7);
    const payloadData = {
      type: next ? "RAISE_HAND" : "LOWER_HAND",
      identity: myId,
      name: studentName || "Participant",
    };
    const jsonStr = JSON.stringify(payloadData);
    if (roomRef.current?.state === "connected") {
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(jsonStr), { reliable: true }).catch(() => {});
    }
    if (bcRef.current) {
      bcRef.current.postMessage(payloadData);
    }
    triggerNotification(next ? "✋ You raised your hand" : "✋ Hand lowered");
  }, [isHandRaised, studentName, triggerNotification]);

  const handleMuteSignal = useCallback((data: { type: string; targetIdentity?: string; targetName?: string; senderName?: string }) => {
    if (!data) return;
    if (data.type === "MUTE_INDIVIDUAL") {
      const myIdentity = roomRef.current?.localParticipant?.identity;
      const isTarget = data.targetIdentity === myIdentity || (data.targetIdentity === "self" && !isInstructor);
      if (isTarget) {
        if (localAudioTrack.current) {
          void localAudioTrack.current.mute();
          setMicOn(false);
        }
      }
      triggerNotification(`🎙️ ${data.senderName || "Admin"} muted ${data.targetName || "a participant"}'s microphone`);
    } else if (data.type === "MUTE_ALL") {
      if (data.senderName !== studentName && localAudioTrack.current) {
        void localAudioTrack.current.mute();
        setMicOn(false);
      }
      triggerNotification(`🎙️ ${data.senderName || "Admin"} muted all microphones`);
    } else if (data.type === "RAISE_HAND") {
      const id = data.targetIdentity || (data as any).identity || "unknown";
      const name = (data as any).name || data.targetName || id;
      setRaisedHands((prev) => ({ ...prev, [id]: name }));
      triggerNotification(`✋ ${name} raised their hand`);
    } else if (data.type === "LOWER_HAND") {
      const id = data.targetIdentity || (data as any).identity || "unknown";
      setRaisedHands((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  }, [isInstructor, studentName, triggerNotification]);

  useEffect(() => {
    try {
      const bc = new BroadcastChannel(`nak-meeting-control-${meeting.id}`);
      bcRef.current = bc;
      bc.onmessage = (evt) => {
        if (evt.data) handleMuteSignal(evt.data);
      };
      return () => {
        bc.close();
      };
    } catch {
      /* BroadcastChannel fallback */
    }
  }, [meeting.id, handleMuteSignal]);

  const handleMuteParticipant = (targetIdentity: string, targetName: string) => {
    const payloadData = {
      type: "MUTE_INDIVIDUAL",
      targetIdentity,
      targetName,
      senderName: studentName || "Admin",
    };
    const jsonStr = JSON.stringify(payloadData);
    if (roomRef.current?.state === "connected") {
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(jsonStr), { reliable: true }).catch(() => {});
    }
    if (bcRef.current) {
      bcRef.current.postMessage(payloadData);
    }
    triggerNotification(`🎙️ ${studentName || "Admin"} muted ${targetName}'s microphone`);
  };

  const handleMuteAll = () => {
    const payloadData = {
      type: "MUTE_ALL",
      senderName: studentName || "Admin",
    };
    const jsonStr = JSON.stringify(payloadData);
    if (roomRef.current?.state === "connected") {
      roomRef.current.localParticipant.publishData(new TextEncoder().encode(jsonStr), { reliable: true }).catch(() => {});
    }
    if (bcRef.current) {
      bcRef.current.postMessage(payloadData);
    }
    triggerNotification(`🎙️ ${studentName || "Admin"} muted all microphones`);
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = s%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
  };

  /* LiveKit — logic unchanged ───────────────────────────────────────────── */
  useEffect(() => {
    activeRef.current = true;
    async function connect() {
      const camP = (async () => {
        try {
          const tracks = await createLocalTracks({ audio:true, video:{ facingMode:"user" } });
          if (!activeRef.current) { tracks.forEach(t => t.stop()); return; }
          const vid = tracks.find(t => t.kind === Track.Kind.Video) ?? null;
          const aud = tracks.find(t => t.kind === Track.Kind.Audio) ?? null;
          localVideoTrack.current = vid; localAudioTrack.current = aud;
          if (vid && vid.mediaStreamTrack) {
            // Attach to the hidden element — always mounted
            const stream = new MediaStream([vid.mediaStreamTrack]);
            if (hiddenSelfRef.current) {
              hiddenSelfRef.current.srcObject = stream;
              void hiddenSelfRef.current.play().catch(() => {});
            }
            setSelfStream(stream);
          }
          if (activeRef.current) setCameraReady(true);
          return { vid, aud };
        } catch { if (activeRef.current) setCameraError("Camera access denied."); return { vid:null, aud:null }; }
      })();

      let url: string, token: string;
      try {
        const res = await fetch(`/api/learning/livekit/token?classId=${encodeURIComponent(meeting.id)}`);
        const d   = await res.json();
        if (!res.ok || !d.url || !d.token) throw new Error(d.error ?? "Token unavailable");
        url   = (d.url as string).replace(/^https:\/\//,"wss://").replace(/^http:\/\//,"ws://");
        token = d.token as string;
      } catch { if (activeRef.current) setConnStatus("error"); return; }
      if (!activeRef.current) return;

      const room = new Room({ adaptiveStream:false, dynacast:true, disconnectOnPageLeave:false });
      roomRef.current = room;
      room.on(RoomEvent.Connected, () => { if (activeRef.current) { setConnStatus("live"); setActiveRoom(room); } });
      room.on(RoomEvent.Disconnected, () => { if (activeRef.current) setConnStatus("error"); });
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);
          handleMuteSignal(data);
        } catch { /* parse error */ }
      });
      room.on(RoomEvent.Reconnected, () => {
        if (!activeRef.current) return;
        setConnStatus("live");
        setParticipants(prev => {
          const next = { ...prev };
          for (const [id, rp] of Array.from(room.remoteParticipants.entries())) {
            const ex = next[id] ?? { identity: id, name: rp.name || id, videoPub: null, audioPub: null };
            let vp = ex.videoPub;
            let ap = ex.audioPub;
            for (const pub of Array.from(rp.trackPublications.values())) {
              if (pub.kind === Track.Kind.Video && (pub.isSubscribed || pub.track)) vp = pub;
              if (pub.kind === Track.Kind.Audio && (pub.isSubscribed || pub.track)) ap = pub;
            }
            next[id] = { identity: id, name: rp.name || id, videoPub: vp, audioPub: ap };
          }
          return next;
        });
      });
      room.on(RoomEvent.ParticipantConnected, (rp: RemoteParticipant) => {
        if (!activeRef.current) return;
        setParticipants(p => ({ ...p, [rp.identity]: { identity: rp.identity, name: rp.name || rp.identity, videoPub: p[rp.identity]?.videoPub || null, audioPub: p[rp.identity]?.audioPub || null } }));
      });
      room.on(RoomEvent.ParticipantDisconnected, (rp: RemoteParticipant) => {
        if (!activeRef.current) return;
        setParticipants(p => { const n = { ...p }; delete n[rp.identity]; return n; });
      });
      room.on(RoomEvent.TrackSubscribed, (track, pub, rp: RemoteParticipant) => {
        if (!activeRef.current) return;
        setParticipants(p => {
          const ex = p[rp.identity] ?? { identity: rp.identity, name: rp.name || rp.identity, videoPub: null, audioPub: null };
          if (track.kind === Track.Kind.Video) return { ...p, [rp.identity]: { ...ex, videoPub: pub } };
          if (track.kind === Track.Kind.Audio) return { ...p, [rp.identity]: { ...ex, audioPub: pub } };
          return p;
        });
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _pub, rp: RemoteParticipant) => {
        if (!activeRef.current) return;
        setParticipants(p => {
          const ex = p[rp.identity]; if (!ex) return p;
          if (track.kind === Track.Kind.Video) return { ...p, [rp.identity]: { ...ex, videoPub: null } };
          if (track.kind === Track.Kind.Audio) return { ...p, [rp.identity]: { ...ex, audioPub: null } };
          return p;
        });
      });

      try { await room.connect(url, token); }
      catch { if (activeRef.current) setConnStatus("error"); return; }
      if (!activeRef.current) { void room.disconnect(); return; }

      setParticipants(prev => {
        const next = { ...prev };
        for (const [id, rp] of Array.from(room.remoteParticipants.entries())) {
          const ex = next[id] ?? { identity: id, name: rp.name || id, videoPub: null, audioPub: null };
          let vp = ex.videoPub;
          let ap = ex.audioPub;
          for (const pub of Array.from(rp.trackPublications.values())) {
            if (pub.kind === Track.Kind.Video && (pub.isSubscribed || pub.track)) vp = pub;
            if (pub.kind === Track.Kind.Audio && (pub.isSubscribed || pub.track)) ap = pub;
          }
          next[id] = { identity: id, name: rp.name || id, videoPub: vp, audioPub: ap };
        }
        return next;
      });

      const cr = await camP;
      if (cr && activeRef.current && room.state === "connected") {
        for (const t of [cr.vid, cr.aud].filter(Boolean) as LocalTrack[]) {
          await room.localParticipant.publishTrack(t).catch((err) => console.warn("Track publish error:", err));
        }
      }
    }
    void connect();
    return () => {
      activeRef.current = false;
      screenTracks.current.forEach((track) => track.stop());
      const r = roomRef.current;
      roomRef.current = null;
      if (r) {
        r.disconnect().catch(() => {});
      }
      localVideoTrack.current?.stop();
      localAudioTrack.current?.stop();
    };
  }, [meeting.id]);

  const toggleMic = () => {
    const at = localAudioTrack.current; if (!at) return;
    if (micOn) { void at.mute(); setMicOn(false); } else { void at.unmute(); setMicOn(true); }
  };
  const toggleCam = async () => {
    const vt = localVideoTrack.current; if (!vt) return;
    if (camOn) {
      await vt.mute();
      setCamOn(false);
      setCameraRefresh((value) => value + 1);
    } else {
      try {
        await vt.unmute();
        if (vt.mediaStreamTrack) vt.mediaStreamTrack.enabled = true;
        // After unmuting, force the hidden video element to play again
        // so the stream resumes and all SelfVideoTile mirrors update.
        if (hiddenSelfRef.current) {
          void hiddenSelfRef.current.play().catch(() => {});
        }
        // Bump selfStream so SelfVideoTile useEffect re-runs and calls play()
        setSelfStream(s => s ? new MediaStream(s.getTracks()) : s);
        setCamOn(true);
        setCameraRefresh((value) => value + 1);
      } catch {
        setCamOn(true);
        setCameraRefresh((value) => value + 1);
      }
    }
  };
  const toggleScreenShare = async () => {
    if (!isInstructor || !roomRef.current) return;
    if (screenSharing) {
      for (const track of screenTracks.current) {
        await roomRef.current.localParticipant.unpublishTrack(track).catch(() => {});
        track.stop();
      }
      screenTracks.current = [];
      setScreenSharing(false);
      setShowMore(false);
      return;
    }
    try {
      const tracks = await createLocalScreenTracks({ audio: true });
      for (const track of tracks) await roomRef.current.localParticipant.publishTrack(track);
      screenTracks.current = tracks;
      setScreenSharing(true);
      setShowMore(false);
    } catch {
      setCameraError("Screen sharing was cancelled or is not available in this browser.");
    }
  };
  const leaveMeeting = () => {
    roomRef.current?.disconnect().catch(() => {});
    onLeave?.();
  };

  const remoteList = Object.values(participants);
  const totalCount = remoteList.length + 1;
  const galleryTiles = [{ identity: "self", self: true as const }, ...remoteList];
  const galleryColumns = galleryTiles.length <= 1 ? 1 : galleryTiles.length <= 4 ? 2 : galleryTiles.length <= 9 ? 3 : 4;
  const useGroupGrid = totalCount > 2;
  const hostTile   = remoteList.find(t => t.identity.startsWith("instructor-"));
  const otherTiles = remoteList.filter(t => !t.identity.startsWith("instructor-"));
  const connColor  = connStatus === "live" ? MIC_ON : connStatus === "error" ? RED : GOLD;

  /* shared self-tile props */
  const selfProps = { hiddenSrc: selfStream, micOn, studentName, cameraOn: camOn && cameraReady, refreshToken: cameraRefresh, videoTrack: localVideoTrack.current };

  /* ════════════════════════════════════════════════════════════════════════ */
  /* MOBILE LAYOUT                                                            */
  /* ════════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    // Large left = host (if present) else self
    // Right 4 slots = students; if host present + 0 students → self in slot 0 once only
    const rightSlots: Array<PTile | "self" | null> = [];
    if (hostTile) {
      if (otherTiles.length === 0) {
        rightSlots.push("self");
      } else {
        rightSlots.push(...otherTiles);
      }
    } else {
      if (otherTiles.length === 0) {
        rightSlots.push(null);
      } else {
        rightSlots.push(...otherTiles);
      }
    }

    return (
      <div style={{ position:"fixed", inset:0, zIndex:1100, height:"100dvh", width:"100vw", background:"#0d0d0d", color:WHITE, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Always-mounted hidden video — track attaches here once, never unmounts */}
        <video ref={hiddenSelfRef} autoPlay playsInline muted
          style={{ position:"absolute", width:1, height:1, opacity:0, pointerEvents:"none", top:-9999 }}/>

        {/* ── TOP BAR ────────────────────────────────────────────────── */}
        <div style={{ height:56, padding:"0 0.75rem", display:"flex", alignItems:"center", gap:"0.5rem", background:"#111111", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
          <Link href="/learning" style={{ display:"flex", alignItems:"center", justifyContent:"center", width:34, height:34, borderRadius:8, background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.7)", textDecoration:"none", flexShrink:0 }}>
            <BackArrow s={18} c="rgba(255,255,255,0.8)"/>
          </Link>
          <NakLogo light compact/>
          <div style={{ flex:1, minWidth:0, padding:"0 0.25rem" }}>
            <div style={{ color:WHITE, fontWeight:700, fontSize:"0.82rem", lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {meeting.title || "General Meeting"}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}>
              <span style={{ color:"rgba(255,255,255,0.45)", fontSize:"0.58rem" }}>General Meeting</span>
              <span style={{ background:RED, color:WHITE, fontWeight:800, fontSize:"0.52rem", padding:"0.08rem 0.38rem", borderRadius:3, letterSpacing:"0.06em" }}>LIVE</span>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.25rem", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"0.22rem 0.5rem", flexShrink:0 }}>
            <span style={{ fontSize:"0.62rem", color:"rgba(255,255,255,0.5)" }}>⏱</span>
            <span style={{ fontWeight:700, fontSize:"0.72rem", fontVariantNumeric:"tabular-nums", color:WHITE }}>{fmt(elapsed)}</span>
          </div>
          <div style={{ width:34, height:34, borderRadius:8, background:"rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative" }}>
            <People s={16} c="rgba(255,255,255,0.7)"/>
            <span style={{ position:"absolute", top:-3, right:-3, background:GOLD, color:INK, borderRadius:"50%", padding:"0 4px", minWidth:16, height:16, fontSize:"0.52rem", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {totalCount}
            </span>
          </div>
        </div>

        {/* ── SCROLLABLE CONTENT ─────────────────────────────────────── */}
        <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", minHeight:0 }}>

          {/* VIDEO GRID */}
          <div style={{ padding:"0.55rem 0.55rem 0", flexShrink:0 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gridTemplateRows:"auto auto", gap:"0.4rem" }}>
              {/* Large left */}
              <div style={{ gridColumn:"1", gridRow:"1 / 3", position:"relative", borderRadius:12, overflow:"hidden", background:CARD2, border:`2px solid ${GOLD}`, aspectRatio:"3/4", minHeight:0 }}>
                {hostTile
                  ? <RemoteTile tile={hostTile} large/>
                  : <SelfVideoTile {...selfProps} showExpandIcon/>
                }
              </div>
              {/* Right 4 slots */}
              {rightSlots.map((slot, i) => {
                if (!slot) return <div key={i} style={{ borderRadius:8, background:"rgba(255,255,255,0.04)", border:"1px dashed rgba(255,255,255,0.08)", aspectRatio:"4/3" }}/>;
                return (
                  <div key={i} style={{ borderRadius:8, overflow:"hidden", background:CARD2, border:"1px solid rgba(255,255,255,0.08)", aspectRatio:"4/3", position:"relative" }}>
                    {slot === "self"
                      ? <SelfVideoTile {...selfProps} compact/>
                      : <RemoteTile tile={slot} compact/>
                    }
                  </div>
                );
              })}
            </div>
          </div>

          {/* INLINE PANEL */}
          <div style={{ flex:1, background:PANEL_BG, marginTop:"0.55rem", display:"flex", flexDirection:"column", minHeight:0 }}>
            <div style={{ display:"flex", alignItems:"center", background:PANEL_HDR, borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
              {(["participants","chat","qa","materials"] as const).map(t => {
                const icons = {
                  participants:<People s={13} c={activeTab===t?GOLD:"rgba(255,255,255,0.5)"}/>,
                  chat:<ChatIcon s={13} c={activeTab===t?GOLD:"rgba(255,255,255,0.5)"}/>,
                  qa:<QAIcon s={13} c={activeTab===t?GOLD:"rgba(255,255,255,0.5)"}/>,
                  materials:<MaterialsIcon s={13} c={activeTab===t?GOLD:"rgba(255,255,255,0.5)"}/>
                };
                const labels = { participants:"Participants", chat:"Chat", qa:"Q&A", materials:"Materials" };
                return (
                  <button key={t} type="button" onClick={() => { setActiveTab(t); setPanelOpen(true); }}
                    style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"0.15rem", background:"transparent", border:"none", borderBottom:activeTab===t?`2px solid ${GOLD}`:"2px solid transparent", padding:"0.6rem 0.1rem", cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
                    {icons[t]}
                    <span style={{ fontSize:"0.58rem", fontWeight:600, color:activeTab===t?GOLD:"rgba(255,255,255,0.5)" }}>{labels[t]}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => setPanelOpen(v => !v)}
                style={{ width:40, display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", cursor:"pointer", padding:"0.6rem 0.3rem", flexShrink:0, WebkitTapHighlightColor:"transparent" }}>
                {panelOpen ? <ChevronDown2 s={15} c="rgba(255,255,255,0.4)"/> : <ChevronUp s={15} c="rgba(255,255,255,0.4)"/>}
              </button>
            </div>

            {panelOpen && (
              <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:180 }}>
                {activeTab === "participants" && (
                  <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", flex:1 }}>
                    <div style={{ padding:"0.6rem 0.75rem", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontWeight:700, fontSize:"0.82rem", color:WHITE }}>{totalCount} Participants</span>
                      <div style={{ display:"flex", alignItems:"center", gap:"0.3rem", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:7, padding:"0.28rem 0.55rem" }}>
                        <Search s={12} c="rgba(255,255,255,0.4)"/>
                        <input placeholder="Search participants..." style={{ background:"transparent", border:"none", outline:"none", fontSize:"0.72rem", color:WHITE, width:120 }}/>
                      </div>
                    </div>
                    <div style={{ flex:1, overflowY:"auto" }}>
                      <ParticipantRow name={studentName} role={isInstructor ? "Instructor" : "Student"} micOn={micOn} camOn={camOn} isHost={isInstructor} isSelf/>
                      {hostTile && <ParticipantRow name={hostTile.name} role="Instructor" micOn={!!hostTile.audioPub?.track} camOn={!!hostTile.videoPub?.track} isHost isSelf={false}/>}
                      {otherTiles.map(t => <ParticipantRow key={t.identity} name={t.name} role="Student" micOn={!!t.audioPub?.track} camOn={!!t.videoPub?.track} isHost={false} isSelf={false}/>)}
                    </div>
                  </div>
                )}
                {activeTab === "chat" && (
                  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
                    <ClassroomChat classId={meeting.id} room={activeRoom} isInstructor={isInstructor} userId={studentName} userName={studentName}/>
                  </div>
                )}
                {activeTab === "qa" && (
                  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
                    <ClassroomChat classId={meeting.id} room={activeRoom} isInstructor={isInstructor} userId={studentName} userName={studentName} initialTab="qa"/>
                  </div>
                )}
                {activeTab === "materials" && (
                  <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem" }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:"2rem", marginBottom:"0.4rem" }}>📁</div>
                      <p style={{ color:"rgba(255,255,255,0.35)", fontSize:"0.8rem", margin:0 }}>No materials shared yet.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM CONTROLS ────────────────────────────────────────── */}
        <div style={{ background:"#111111", borderTop:"1px solid rgba(255,255,255,0.07)", padding:"0.45rem 0.3rem calc(0.5rem + env(safe-area-inset-bottom,0px))", display:"flex", alignItems:"center", justifyContent:"space-around", flexShrink:0 }}>
          <MobileCtrlBtn icon={<Mic s={20} c={micOn?MIC_ON:"rgba(255,255,255,0.7)"}/>} label="Mic" onClick={toggleMic} active={micOn} activeColor={MIC_ON}/>
          <MobileCtrlBtn icon={<Cam s={20} c={camOn?WHITE:"rgba(255,255,255,0.4)"}/>} label="Camera" onClick={toggleCam} active={camOn}/>
          {isInstructor && <MobileCtrlBtn icon={<Present s={20} c={WHITE}/>} label={screenSharing ? "Stop share" : "Share screen"} onClick={toggleScreenShare} highlight={!screenSharing}/>}
          <MobileCtrlBtn icon={<MaterialsIcon s={20} c="rgba(255,255,255,0.7)"/>} label="Materials" onClick={() => { setActiveTab("materials"); setPanelOpen(true); }}/>
          <MobileCtrlBtn icon={<ChatIcon s={20} c={activeTab==="chat"&&panelOpen?GOLD:"rgba(255,255,255,0.7)"}/>} label="Chat" onClick={() => { setActiveTab("chat"); setPanelOpen(true); }} active={activeTab==="chat"&&panelOpen}/>
          <MobileCtrlBtn icon={<QAIcon s={20} c={activeTab==="qa"&&panelOpen?GOLD:"rgba(255,255,255,0.7)"}/>} label="Q&A" onClick={() => { setActiveTab("qa"); setPanelOpen(true); }} active={activeTab==="qa"&&panelOpen}/>
          {isInstructor && <MobileCtrlBtn icon={<More s={20} c="rgba(255,255,255,0.7)"/>} label="More" onClick={() => setShowMore(v => !v)}/>}
          <Link href={backHref} onClick={leaveMeeting} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:RED, color:WHITE, borderRadius:14, padding:"0.55rem 0.65rem", textDecoration:"none", minWidth:52, WebkitTapHighlightColor:"transparent" }}>
            <PhoneOff s={20} c={WHITE}/>
            <span style={{ fontSize:"0.58rem", fontWeight:700 }}>Leave</span>
          </Link>
          {showMore && isInstructor && <button type="button" onClick={toggleScreenShare} style={{ position:"absolute", bottom:72, right:58, background:CARD, color:WHITE, border:`1px solid ${GOLD}`, borderRadius:8, padding:"0.55rem 0.8rem", zIndex:10, cursor:"pointer" }}>{screenSharing ? "Stop screen share" : "Share screen"}</button>}
        </div>

        {cameraError && (
          <div style={{ position:"fixed", bottom:90, left:"1rem", right:"1rem", background:"#fee2e2", color:"#991b1b", padding:"0.65rem 1rem", borderRadius:10, fontSize:"0.8rem", zIndex:100, textAlign:"center" }}>
            {cameraError}
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /* DESKTOP LAYOUT                                                           */
  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ position:"fixed", inset:0, zIndex:1100, height:"100dvh", width:"100vw", background:BG, color:WHITE, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* Always-mounted hidden video */}
      <video ref={hiddenSelfRef} autoPlay playsInline muted
        style={{ position:"absolute", width:1, height:1, opacity:0, pointerEvents:"none", top:-9999 }}/>

      {/* top bar */}
      <header style={{ height:58, padding:"0 1.5rem", flexShrink:0, background:`linear-gradient(180deg,${SURFACE} 0%,rgba(28,8,8,0.97) 100%)`, borderBottom:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"1rem", backdropFilter:"blur(10px)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem" }}>
          <NakLogo light/>
          <div style={{ width:1, height:30, background:"rgba(255,255,255,0.12)" }}/>
          <div style={{ display:"flex", alignItems:"center", gap:"0.6rem" }}>
            <div style={{ width:34, height:34, borderRadius:8, background:RIM, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <People s={16} c={GOLD}/>
            </div>
            <div>
              <div style={{ color:WHITE, fontWeight:700, fontSize:"0.88rem", lineHeight:1.2 }}>General Meeting</div>
              <div style={{ color:"rgba(255,255,255,0.42)", fontSize:"0.62rem" }}>NAKCONEL Learning Center Community</div>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.65rem" }}>
          <div style={{ background:RED, color:WHITE, fontWeight:800, fontSize:"0.68rem", padding:"0.25rem 0.7rem", borderRadius:99, letterSpacing:"0.08em", display:"flex", alignItems:"center", gap:"0.3rem" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:WHITE, display:"inline-block", boxShadow:`0 0 5px ${WHITE}` }}/>LIVE
          </div>
          <div style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"0.22rem 0.75rem", fontWeight:700, fontSize:"0.9rem", fontVariantNumeric:"tabular-nums", color:WHITE }}>
            {fmt(elapsed)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.3rem", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"0.22rem 0.7rem", fontSize:"0.78rem", color:"rgba(255,255,255,0.75)" }}>
            <People s={13} c="rgba(255,255,255,0.6)"/> {totalCount}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.75rem" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:connColor, boxShadow:`0 0 6px ${connColor}` }}/>
            <span style={{ color:connColor, fontSize:"0.68rem", fontWeight:600 }}>
              {connStatus === "live" ? "Connected" : connStatus === "error" ? "Disconnected" : "Connecting…"}
            </span>
          </div>
          <div style={{ width:1, height:24, background:"rgba(255,255,255,0.1)" }}/>
          <button style={{ background:"transparent", border:"none", cursor:"pointer", padding:"0.3rem" }}><Bell s={18} c="rgba(255,255,255,0.65)"/></button>
          <div style={{ display:"flex", alignItems:"center", gap:"0.45rem" }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${GOLD},#f6de88)`, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.9rem", boxShadow:`0 0 10px ${GOLD_GLOW}` }}>
              {studentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ color:WHITE, fontSize:"0.78rem", fontWeight:700, lineHeight:1.2 }}>{studentName}</div>
              <div style={{ color:GOLD, fontSize:"0.6rem" }}>Participant</div>
            </div>
          </div>
        </div>
      </header>

      {/* body */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
        {/* gallery */}
        <div style={useGroupGrid ? { flex:1, minWidth:0, overflowY:"auto", padding:"0.9rem", display:"grid", gridTemplateColumns:`repeat(${galleryColumns}, minmax(0, 1fr))`, gridAutoRows:"minmax(150px, 1fr)", alignContent:"stretch", gap:"0.75rem" } : { flex:1, minWidth:0, overflow:"hidden", padding:"0.9rem", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
          <div style={useGroupGrid ? { display:"contents" } : { display:"grid", gridTemplateColumns:"1fr 0.48fr", gap:"0.75rem", flex:1, minHeight:0 }}>
            <div style={{ position:"relative", minHeight:150, borderRadius:14, overflow:"hidden", background:`linear-gradient(160deg,${RIM},${CARD})`, aspectRatio:useGroupGrid ? undefined : "4/3", border:`2px solid ${GOLD}`, boxShadow:`0 0 28px ${GOLD_GLOW},0 6px 24px rgba(0,0,0,0.55)` }}>
              {hostTile
                ? <RemoteTile tile={hostTile} large/>
                : <SelfVideoTile {...selfProps}/>
              }
            </div>
            <div style={useGroupGrid ? { display:"contents" } : { display:"flex", flexDirection:"column", gap:"0.75rem", minHeight:0 }}>
              {hostTile && (
                <div style={{ flex:1, position:"relative", borderRadius:10, overflow:"hidden", background:`linear-gradient(160deg,${RIM},${CARD})`, border:`2px solid ${GOLD}` }}>
                  <SelfVideoTile {...selfProps} compact/>
                </div>
              )}
              {otherTiles[0] && <div style={{ flex:1, position:"relative" }}><RemoteTile tile={otherTiles[0]}/></div>}
              {!otherTiles[0] && !hostTile && (
                <div style={{ flex:1, borderRadius:10, background:CARD, border:"1px dashed rgba(255,255,255,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"0.35rem" }}>
                  <People s={20} c="rgba(255,255,255,0.18)"/>
                  <span style={{ fontSize:"0.68rem", color:"rgba(255,255,255,0.3)" }}>Waiting…</span>
                </div>
              )}
            </div>
          </div>
          {useGroupGrid && otherTiles.slice(1).length > 0 && (
            <div style={{ display:"contents" }}>
              {otherTiles.slice(1).map(t => (
                <div key={t.identity} style={{ position:"relative", minHeight:150 }}><RemoteTile tile={t}/></div>
              ))}
            </div>
          )}
          {false && remoteList.length === 0 && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"0.9rem", opacity:0.55 }}>
              <People s={48} c="rgba(255,255,255,0.3)"/>
              <div style={{ fontWeight:700, fontSize:"1rem" }}>Waiting for others to join…</div>
              <div style={{ fontSize:"0.78rem", color:"rgba(255,255,255,0.45)" }}>Share the meeting link to invite participants</div>
            </div>
          )}
        </div>

        {/* right panel */}
        <div style={{ width:308, flexShrink:0, background:OFF_WHITE, borderLeft:`1px solid ${PANEL_BDR}`, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", background:"white", borderBottom:`1px solid ${PANEL_BDR}`, padding:"0 0.3rem" }}>
            {(["participants","chat","qa"] as const).map(t => (
              <button key={t} type="button" onClick={() => setActiveTab(t)} style={{ flex:1, background:"transparent", border:"none", borderBottom:activeTab===t?`2px solid ${GOLD_DIM}`:"2px solid transparent", color:activeTab===t?GOLD_DIM:MUTED_TXT, padding:"0.72rem 0.2rem", fontSize:"0.68rem", fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:"0.2rem" }}>
                {t==="participants" && <><People s={14} c={activeTab==="participants"?GOLD_DIM:MUTED_TXT}/><span>Participants ({totalCount})</span></>}
                {t==="chat"         && <><ChatIcon s={14} c={activeTab==="chat"?GOLD_DIM:MUTED_TXT}/><span>Chat</span></>}
                {t==="qa"           && <><span style={{ fontSize:"0.85rem", lineHeight:1 }}>?</span><span>Q&amp;A</span></>}
              </button>
            ))}
          </div>
          {activeTab === "participants" && (
            <div style={{ flex:1, overflowY:"auto" }}>
              {isInstructor && (
                <div style={{ padding:"0.6rem 0.85rem", borderBottom:`1px solid ${PANEL_BDR}`, background:"#fff5f5", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:"0.7rem", fontWeight:700, color:WINE }}>Admin Controls</span>
                  <button
                    type="button"
                    onClick={handleMuteAll}
                    style={{ background:RED, color:WHITE, border:"none", borderRadius:6, padding:"0.28rem 0.65rem", fontSize:"0.68rem", fontWeight:700, cursor:"pointer", boxShadow:"0 1px 4px rgba(229,53,53,0.3)" }}
                  >
                    🔇 Mute All
                  </button>
                </div>
              )}
              <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", padding:"0.52rem 0.85rem", borderBottom:`1px solid ${PANEL_BDR}` }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:`linear-gradient(135deg,${GOLD},#f6de88)`, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.9rem", flexShrink:0 }}>{studentName.charAt(0).toUpperCase()}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:"0.8rem", color:INK }}>{studentName}</div>
                  <div style={{ fontSize:"0.62rem", color:MUTED_TXT }}>You · {isInstructor ? "Admin / Host" : "Participant"}</div>
                </div>
                {micOn ? <Mic s={15} c={MIC_ON}/> : <MicOff s={15} c={MIC_OFF}/>}
              </div>
              {remoteList.map(tile => {
                const isHost = tile.identity.startsWith("instructor-");
                return (
                  <div key={tile.identity} style={{ display:"flex", alignItems:"center", gap:"0.6rem", padding:"0.52rem 0.85rem", borderBottom:`1px solid ${PANEL_BDR}` }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:isHost?`linear-gradient(135deg,${WINE},#8b3030)`:"#ede8e2", color:isHost?WHITE:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.88rem", flexShrink:0 }}>{tile.name.charAt(0).toUpperCase()}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:"0.8rem", color:INK, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tile.name}</div>
                      <div style={{ fontSize:"0.62rem", color:MUTED_TXT }}>{isHost?"Host":"Participant"}</div>
                    </div>
                    {!!tile.audioPub?.track ? <Mic s={15} c={MIC_ON}/> : <MicOff s={15} c={MIC_OFF}/>}
                    {isInstructor && !isHost && (
                      <button
                        type="button"
                        onClick={() => handleMuteParticipant(tile.identity, tile.name)}
                        style={{ background:"rgba(229,53,53,0.12)", color:RED, border:"1px solid rgba(229,53,53,0.3)", borderRadius:5, padding:"0.2rem 0.45rem", fontSize:"0.62rem", fontWeight:700, cursor:"pointer" }}
                      >
                        Mute
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {activeTab === "chat" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <ClassroomChat classId={meeting.id} room={activeRoom} isInstructor={isInstructor} userId={studentName} userName={studentName}/>
            </div>
          )}
          {activeTab === "qa" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <ClassroomChat classId={meeting.id} room={activeRoom} isInstructor={isInstructor} userId={studentName} userName={studentName} initialTab="qa"/>
            </div>
          )}
        </div>
      </div>

      {/* bottom bar */}
      <div style={{ flexShrink:0, padding:"0.5rem 1.5rem", background:`linear-gradient(0deg,${SURFACE} 0%,rgba(28,8,8,0.97) 100%)`, borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between", backdropFilter:"blur(10px)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"0.42rem 0.85rem" }}>
          <People s={14} c={GOLD}/>
          <div>
            <div style={{ color:WHITE, fontSize:"0.72rem", fontWeight:700 }}>General Meeting</div>
            <div style={{ color:"rgba(255,255,255,0.38)", fontSize:"0.56rem" }}>NAKCONEL Learning Center</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:"0.28rem" }}>
          {([
            { icon:<Mic s={20} c={micOn?MIC_ON:MIC_OFF}/>, label:micOn?"Mute":"Unmute", onClick:toggleMic, active:micOn, color:micOn?MIC_ON:MIC_OFF },
            { icon:<Cam s={20} c={camOn?WHITE:"rgba(255,255,255,0.4)"}/>, label:camOn?"Stop Video":"Start Video", onClick:toggleCam, active:camOn },
            { icon:<People s={20} c={activeTab==="participants"?GOLD:WHITE}/>, label:"Participants", onClick:()=>setActiveTab("participants"), active:activeTab==="participants" },
            { icon:<ChatIcon s={20} c={activeTab==="chat"?GOLD:WHITE}/>, label:"Chat", onClick:()=>setActiveTab("chat"), active:activeTab==="chat" },
            ...(isInstructor ? [{ icon:<More s={20} c="rgba(255,255,255,0.75)"/>, label:"More", onClick:()=>setShowMore(v => !v) }] : []),
          ] as { icon:React.ReactNode; label:string; onClick?:()=>void; active?:boolean; color?:string }[]).map(({ icon, label, onClick, active, color }) => (
            <button key={label} type="button" onClick={onClick} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:active?"rgba(232,184,75,0.14)":"rgba(255,255,255,0.05)", border:active?`1px solid ${GOLD_DIM}`:"1px solid rgba(255,255,255,0.08)", color:color??(active?GOLD:"rgba(255,255,255,0.82)"), borderRadius:10, padding:"0.5rem 0.85rem", cursor:"pointer", minWidth:56, transition:"background 0.15s" }}>
              {icon}
              <span style={{ fontSize:"0.59rem", fontWeight:700, letterSpacing:"0.04em", whiteSpace:"nowrap" }}>{label}</span>
            </button>
          ))}
        </div>
        <Link href={backHref} onClick={leaveMeeting} style={{ display:"flex", alignItems:"center", gap:"0.45rem", background:RED, color:WHITE, borderRadius:10, padding:"0.55rem 1.3rem", fontWeight:700, fontSize:"0.85rem", textDecoration:"none", boxShadow:"0 2px 14px rgba(229,53,53,0.38)" }}>
          <PhoneOff s={16} c={WHITE}/> Leave Meeting
        </Link>
        {showMore && isInstructor && <button type="button" onClick={toggleScreenShare} style={{ position:"absolute", right:"7.5rem", bottom:"4.3rem", background:CARD, color:WHITE, border:`1px solid ${GOLD}`, borderRadius:8, padding:"0.6rem 0.9rem", cursor:"pointer", zIndex:5 }}>{screenSharing ? "Stop screen share" : "Share screen"}</button>}
      </div>

      {muteNotice && (
        <div style={{
          position: "fixed",
          top: 68,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 99999,
          background: "rgba(153, 27, 27, 0.95)",
          backdropFilter: "blur(12px)",
          color: "#ffffff",
          border: "1px solid rgba(255, 217, 138, 0.5)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          borderRadius: 99,
          padding: "0.55rem 1.35rem",
          fontSize: "0.82rem",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          pointerEvents: "none",
        }}>
          <span style={{ fontSize: "1rem" }}>🎙️</span>
          <span>{muteNotice}</span>
        </div>
      )}

      {cameraError && (
        <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background:"#fee2e2", color:"#991b1b", padding:"0.55rem 1rem", borderRadius:8, fontSize:"0.8rem", zIndex:100 }}>
          {cameraError}
        </div>
      )}
    </div>
  );
}

/* ─── Helper components ─────────────────────────────────────────────────── */

function MobileCtrlBtn({ icon, label, onClick, active, highlight, activeColor }: {
  icon: React.ReactNode; label: string; onClick?: () => void;
  active?: boolean; highlight?: boolean; activeColor?: string;
}) {
  return (
    <button type="button" onClick={onClick} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:highlight?"#d4a843":active?"rgba(232,184,75,0.1)":"transparent", border:highlight?"none":active?`1px solid rgba(232,184,75,0.3)`:"1px solid transparent", color:activeColor??(highlight?INK:active?GOLD:"rgba(255,255,255,0.75)"), borderRadius:12, padding:"0.5rem 0.5rem", cursor:"pointer", minWidth:44, WebkitTapHighlightColor:"transparent", transition:"background 0.12s" }}>
      {icon}
      <span style={{ fontSize:"0.56rem", fontWeight:600, letterSpacing:"0.02em", whiteSpace:"nowrap" }}>{label}</span>
    </button>
  );
}

function ParticipantRow({ name, role, micOn, camOn, isHost, isSelf }: {
  name: string; role: string; micOn: boolean; camOn: boolean; isHost: boolean; isSelf: boolean;
}) {
  const initial = name.charAt(0).toUpperCase();
  const avatarBg = isHost ? "linear-gradient(135deg,#6b1f1f,#8b3030)" : isSelf ? `linear-gradient(135deg,${GOLD},#f6de88)` : "rgba(255,255,255,0.1)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.65rem", padding:"0.55rem 0.75rem", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ width:36, height:36, borderRadius:"50%", background:avatarBg, color:isSelf?INK:WHITE, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.88rem", flexShrink:0, position:"relative" }}>
        {initial}
        <span style={{ position:"absolute", bottom:0, right:0, width:9, height:9, borderRadius:"50%", background:MIC_ON, border:"1.5px solid #141414" }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:"0.78rem", color:WHITE, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}{isSelf?" (You)":""}</div>
        <div style={{ fontSize:"0.6rem", color:"rgba(255,255,255,0.4)" }}>{isHost?"(Instructor)":`(${role})`}</div>
      </div>
      <div style={{ width:28, height:28, borderRadius:6, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Mic s={14} c={micOn?MIC_ON:MIC_OFF}/>
      </div>
      <div style={{ width:28, height:28, borderRadius:6, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Cam s={14} c={camOn?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.2)"}/>
      </div>
      <div style={{ width:28, height:28, borderRadius:6, background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <More s={14} c="rgba(255,255,255,0.45)"/>
      </div>
    </div>
  );
}
