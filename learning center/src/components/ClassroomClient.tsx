"use client";

/**
 * ClassroomClient — student live classroom, NAKCONEL Learning Center.
 * Palette: deep wine (#330808) + white. No blue anywhere.
 * Mobile: slide viewer scrollable, panels in bottom sheet.
 * Desktop: 3-column layout.
 * Materials: view-only inside iframe, no download capability.
 */

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import ClassroomVideoFeed, { type PresentationState } from "@/components/ClassroomVideoFeed";
import ClassroomChat from "@/components/ClassroomChat";
import ClassroomPollOverlay from "@/components/ClassroomPollOverlay";
import { Room, RoomEvent } from "livekit-client";

/* ── Brand tokens — wine + white ──────────────────────────────────────────── */
const BG      = "#1a0505";   // deep wine-black bg
const BG2     = "#280808";   // panel bg
const BG3     = "#3d1010";   // card/hover
const WINE    = "#7f1d1d";   // accent wine
const WINE2   = "#991b1b";   // lighter wine for borders
const GOLD    = "#d4a843";
const GOLDD   = "#b8922f";
const WHITE   = "#ffffff";
const OFF_W   = "#fff8f8";   // warm white for light panels
const GRAY    = "#fde8e8";   // light wine-tinted gray
const GRAY2   = "#c4a0a0";   // muted text on dark
const INK     = "#1a0505";
const RED_BTN = "#991b1b";
const GREEN   = "#22c55e";
const BORDER  = "rgba(255,255,255,0.09)";
const WBORDER = "rgba(127,29,29,0.25)";  // wine-tinted border for light panels

/* ── File type badges ─────────────────────────────────────────────────────── */
const FILE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pdf:   { bg:"#fee2e2", color:"#991b1b", label:"PDF" },
  ppt:   { bg:"#fde8d4", color:"#c2410c", label:"PPT" },
  doc:   { bg:"#fde8e8", color:"#7f1d1d", label:"DOC" },
  xls:   { bg:"#dcfce7", color:"#15803d", label:"XLS" },
  img:   { bg:"#fdf4ff", color:"#7e22ce", label:"IMG" },
  zip:   { bg:"#f3f4f6", color:"#4b5563", label:"ZIP" },
  other: { bg:"#f3f4f6", color:"#4b5563", label:"FILE" },
};

type Material = { id: string; title: string; fileName: string; mimeType: string; sizeBytes?: number };
type LearningClass = {
  id: string; title: string; course: string; module: string | null;
  instructor: string | null; description?: string | null;
  activeMaterialId?: string | null; presentationPage?: number | null;
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getFileType(mimeType: string): keyof typeof FILE_COLORS {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "ppt";
  if (mimeType.includes("word") || mimeType.includes("document")) return "doc";
  if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "xls";
  if (mimeType.startsWith("image/")) return "img";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "zip";
  return "other";
}
function fmtType(m: string) {
  if (m === "application/pdf") return "PDF";
  if (m.startsWith("image/")) return "Image";
  if (m.includes("word") || m.includes("document")) return "Word";
  if (m.includes("spreadsheet") || m.includes("excel")) return "Excel";
  if (m.includes("presentation") || m.includes("powerpoint")) return "PPT";
  return "File";
}
function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}
function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}

/* ── Logo ────────────────────────────────────────────────────────────────── */
function NakLogo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"0.45rem" }}>
      {/* Company unicorn logo */}
      <img
        src="/logo.png"
        alt="NAKCONEL"
        style={{ width:compact?26:34, height:compact?26:34, objectFit:"contain", flexShrink:0, filter:"drop-shadow(0 1px 4px rgba(212,168,67,0.35))" }}
      />
      {!compact && (
        <div>
          <div style={{ color:light?WHITE:INK, fontWeight:900, fontSize:"0.92rem", lineHeight:1 }}>NAKCONEL</div>
          <div style={{ color:light?"rgba(255,255,255,0.5)":GRAY2, fontSize:"0.55rem", letterSpacing:"0.06em" }}>Learning Center</div>
        </div>
      )}
    </div>
  );
}

/* ── File type badge ─────────────────────────────────────────────────────── */
function FileTypeBadge({ mimeType, size="normal" }: { mimeType: string; size?: "normal"|"small" }) {
  const cfg = FILE_COLORS[getFileType(mimeType)];
  const dim = size === "small" ? 28 : 36;
  return (
    <div style={{ width:dim, height:dim, borderRadius:7, background:cfg.bg, color:cfg.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size==="small"?"0.5rem":"0.55rem", fontWeight:800, letterSpacing:"0.02em", flexShrink:0 }}>
      {cfg.label}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
function ScreenShareViewer({ track }: { track: any }) {
  const vidRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = vidRef.current;
    if (!el || !track) return;
    track.attach(el);
    void el.play().catch(() => {});
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#050202", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <video ref={vidRef} autoPlay playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      <div style={{ position: "absolute", top: "0.75rem", left: "0.75rem", background: "rgba(0,0,0,0.85)", border: "1px solid #d4a843", borderRadius: 6, padding: "0.3rem 0.75rem", color: "#d4a843", fontSize: "0.78rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.45rem", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
        <span>🖥️</span> Instructor Screen Share (Primary Focus)
      </div>
    </div>
  );
}

export default function ClassroomClient({ learningClass, materials }: { learningClass: LearningClass; materials: Material[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [activeRoom,   setActiveRoom]   = useState<Room | null>(null);
  const [leftTab,      setLeftTab]      = useState<"materials"|"chat"|"qa"|"info">("materials");
  const [rightTab,     setRightTab]     = useState<"participants"|"chat">("chat");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsed,      setElapsed]      = useState(0);
  const [isMobile,     setIsMobile]     = useState(false);
  const [showSheet,    setShowSheet]    = useState(false);
  const [sheetTab,     setSheetTab]     = useState<"materials"|"chat"|"qa"|"info">("materials");
  const [notes,        setNotes]        = useState("");
  const [matSearch,    setMatSearch]    = useState("");
  const [isHandRaised,     setIsHandRaised]     = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState<any | null>(null);
  const [localAudioTrack,  setLocalAudioTrack]  = useState<any | null>(null);

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
    const myId = activeRoom?.localParticipant?.identity || "student-" + Math.random().toString(36).substring(7);
    const payloadData = {
      type: next ? "RAISE_HAND" : "LOWER_HAND",
      identity: myId,
      name: "Student",
    };
    const jsonStr = JSON.stringify(payloadData);
    if (activeRoom && activeRoom.state === "connected") {
      activeRoom.localParticipant.publishData(new TextEncoder().encode(jsonStr), { reliable: true }).catch(() => {});
    }
    try {
      const bc = new BroadcastChannel(`nak-classroom-${learningClass.id}`);
      bc.postMessage(payloadData);
      bc.close();
    } catch {}
    triggerNotification(next ? "✋ You raised your hand" : "✋ Hand lowered");
  }, [activeRoom, isHandRaised, learningClass.id, triggerNotification]);

  useEffect(() => {
    if (!learningClass.id) return;
    try {
      const bc = new BroadcastChannel(`nak-classroom-${learningClass.id}`);
      bc.onmessage = (evt) => {
        const d = evt.data;
        if (!d) return;
        if (d.type === "MUTE_STUDENT" || d.type === "MUTE_INDIVIDUAL") {
          triggerNotification(`🎙️ ${d.senderName || "Instructor"} muted ${d.targetName || "a student"}'s microphone`);
        } else if (d.type === "MUTE_ALL") {
          triggerNotification(`🎙️ ${d.senderName || "Instructor"} muted all microphones`);
        }
      };
      return () => bc.close();
    } catch { /* BroadcastChannel fallback */ }
  }, [learningClass.id, triggerNotification]);

  useEffect(() => {
    if (!activeRoom) return;
    const handleData = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const d = JSON.parse(text);
        if (d.type === "MUTE_STUDENT" || d.type === "MUTE_INDIVIDUAL") {
          triggerNotification(`🎙️ ${d.senderName || "Instructor"} muted ${d.targetName || "a student"}'s microphone`);
        } else if (d.type === "MUTE_ALL") {
          triggerNotification(`🎙️ ${d.senderName || "Instructor"} muted all microphones`);
        }
      } catch { /* parse fail */ }
    };
    activeRoom.on(RoomEvent.DataReceived, handleData);
    return () => {
      activeRoom.off(RoomEvent.DataReceived, handleData);
    };
  }, [activeRoom, triggerNotification]);

  const [presState, setPresState] = useState<PresentationState>({
    materialId: learningClass.activeMaterialId && materials.some(m => m.id === learningClass.activeMaterialId)
      ? learningClass.activeMaterialId
      : materials[0]?.id ?? "",
    page: learningClass.presentationPage ?? 1,
  });

  const selected    = materials.find(m => m.id === presState.materialId);
  const previewable = selected?.mimeType === "application/pdf" || !!selected?.mimeType?.startsWith("image/");
  const filteredMaterials = materials.filter(m =>
    matSearch === "" || m.title.toLowerCase().includes(matSearch.toLowerCase())
  );

  const handlePresentationState = useCallback((ps: PresentationState) => setPresState(ps), []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (learningClass.id) {
      void fetch("/api/learning/attendance", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ classId:learningClass.id }) }).catch(() => {});
    }
  }, [learningClass.id]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) void stageRef.current.requestFullscreen().catch(() => {});
    else void document.exitFullscreen().catch(() => {});
  };

  /* ── Panel content (shared mobile/desktop) ───────────────────────────── */
  function PanelContent({ dark }: { dark?: boolean }) {
    const bdr  = dark ? BORDER : `1px solid ${WBORDER}`;
    const bgIn = dark ? "rgba(255,255,255,0.06)" : WHITE;
    const txtC = dark ? WHITE : INK;
    const mutC = dark ? "rgba(255,255,255,0.45)" : "#9b5c5c";
    const bg   = dark ? BG2 : OFF_W;
    const curTab = dark ? sheetTab : leftTab;
    const setTab = (t: typeof leftTab) => dark ? setSheetTab(t as typeof sheetTab) : setLeftTab(t);

    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", background:bg }}>
        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:bdr, background:dark?BG:WHITE, flexShrink:0 }}>
          {(["materials","chat","qa","info"] as const).map(key => {
            const labels = { materials:"Materials", chat:"Chat", qa:"Q&A", info:"Info" };
            const active = curTab === key;
            return (
              <button key={key} type="button" onClick={() => setTab(key)}
                style={{ flex:1, background:"transparent", border:"none", borderBottom:active?`2px solid ${WINE2}`:"2px solid transparent", color:active?WINE2:mutC, padding:"0.65rem 0.1rem", fontSize:"0.68rem", fontWeight:700, cursor:"pointer", WebkitTapHighlightColor:"transparent" }}>
                {labels[key]}
              </button>
            );
          })}
        </div>

        {/* Materials */}
        {curTab === "materials" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"0.65rem 0.75rem", borderBottom:bdr, flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"0.5rem" }}>
                <span style={{ fontWeight:700, fontSize:"0.82rem", color:txtC }}>Class Materials</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", background:bgIn, border:bdr, borderRadius:6, padding:"0.3rem 0.5rem", gap:"0.3rem" }}>
                <span style={{ fontSize:"0.8rem", color:mutC }}>🔍</span>
                <input value={matSearch} onChange={e => setMatSearch(e.target.value)} placeholder="Search materials…"
                  style={{ flex:1, background:"transparent", border:"none", outline:"none", fontSize:"0.75rem", color:txtC }} />
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"0.4rem 0.5rem" }}>
              {filteredMaterials.length === 0 ? (
                <p style={{ color:mutC, fontSize:"0.8rem", textAlign:"center", padding:"1.5rem 0" }}>No materials yet</p>
              ) : filteredMaterials.map(m => {
                const isActive = m.id === presState.materialId;
                return (
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:"0.55rem", padding:"0.5rem 0.55rem", borderRadius:8, background:isActive?(dark?"rgba(153,27,27,0.15)":"#fff0f0"):"transparent", border:isActive?`1px solid ${WINE2}`:"1px solid transparent", marginBottom:"0.2rem" }}>
                    <FileTypeBadge mimeType={m.mimeType}/>
                    <div style={{ flex:1, overflow:"hidden" }}>
                      <div style={{ color:txtC, fontSize:"0.78rem", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.title}</div>
                      <div style={{ color:mutC, fontSize:"0.62rem" }}>{fmtType(m.mimeType)}{m.sizeBytes ? ` · ${fmtSize(m.sizeBytes)}` : ""}</div>
                    </div>
                    {isActive && <div style={{ background:WINE2, color:WHITE, fontSize:"0.55rem", fontWeight:800, padding:"0.12rem 0.4rem", borderRadius:4, whiteSpace:"nowrap" }}>Presenting</div>}
                  </div>
                );
              })}
            </div>
            {/* Notes */}
            <div style={{ padding:"0.65rem 0.75rem", borderTop:bdr, flexShrink:0 }}>
              <div style={{ fontWeight:700, fontSize:"0.78rem", color:txtC, marginBottom:"0.35rem" }}>My Class Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Take notes during class…"
                style={{ width:"100%", minHeight:72, background:bgIn, border:bdr, borderRadius:6, color:txtC, fontSize:"0.75rem", padding:"0.45rem", resize:"none", outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>
        )}

        {/* Chat */}
        {curTab === "chat" && (
          <div style={{ flex:1, overflow:"auto", padding:"0.75rem" }}>
            <ClassroomChat classId={learningClass.id} room={activeRoom} isInstructor={false} />
          </div>
        )}

        {/* Q&A */}
        {curTab === "qa" && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"2.5rem", marginBottom:"0.5rem" }}>❓</div>
              <p style={{ color:mutC, fontSize:"0.82rem", margin:0 }}>No questions yet.</p>
            </div>
          </div>
        )}

        {/* Info */}
        {curTab === "info" && (
          <div style={{ flex:1, overflowY:"auto", padding:"0.75rem" }}>
            <div style={{ color:txtC, fontWeight:700, fontSize:"0.88rem", marginBottom:"0.75rem" }}>{learningClass.title}</div>
            {([["Course", learningClass.course], ["Instructor", learningClass.instructor ?? "—"], ["Status", "● Live"], ["Duration", fmtTime(elapsed)]] as [string,string][]).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"0.4rem 0", borderBottom:bdr }}>
                <span style={{ color:mutC, fontSize:"0.75rem" }}>{k}</span>
                <span style={{ color:k==="Status"?GREEN:txtC, fontSize:"0.78rem", fontWeight:600 }}>{v}</span>
              </div>
            ))}
            <p style={{ color:mutC, fontSize:"0.75rem", marginTop:"0.75rem", lineHeight:1.5 }}>
              {learningClass.description ?? "The presentation updates automatically. Your instructor controls the slides."}
            </p>
            <div style={{ marginTop:"0.6rem", background:"rgba(153,27,27,0.1)", border:`1px solid ${WINE2}`, borderRadius:6, padding:"0.5rem 0.65rem", fontSize:"0.72rem", color:WINE2 }}>
              🔒 View only — downloads are disabled during live sessions.
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /* MOBILE LAYOUT                                                            */
  /* ════════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <div style={{ height:"100dvh", background:BG, color:WHITE, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Top bar */}
        <div style={{ height:50, padding:"0 0.85rem", display:"flex", alignItems:"center", justifyContent:"space-between", background:BG2, borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
            <NakLogo light compact />
            <div style={{ width:1, height:24, background:"rgba(255,255,255,0.12)" }} />
            <div>
              <div style={{ color:"rgba(255,255,255,0.55)", fontSize:"0.6rem", lineHeight:1 }}>{learningClass.course}</div>
              <div style={{ color:WHITE, fontSize:"0.75rem", fontWeight:700, lineHeight:1.2, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {learningClass.module ?? learningClass.title}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.4rem" }}>
            <div style={{ background:RED_BTN, color:WHITE, fontWeight:800, fontSize:"0.58rem", padding:"0.18rem 0.5rem", borderRadius:99, display:"flex", alignItems:"center", gap:"0.22rem" }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:WHITE, display:"inline-block" }} />LIVE
            </div>
            <div style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"0.2rem 0.5rem", fontWeight:700, fontSize:"0.72rem", fontVariantNumeric:"tabular-nums" }}>
              {fmtTime(elapsed)}
            </div>
          </div>
        </div>

        {/* PDF nav bar */}
        <div style={{ background:BG3, borderBottom:"1px solid rgba(255,255,255,0.08)", padding:"0.35rem 0.75rem", display:"flex", alignItems:"center", gap:"0.5rem", flexShrink:0 }}>
          {selected ? (
            <>
              <FileTypeBadge mimeType={selected.mimeType} size="small" />
              <span style={{ color:WHITE, fontSize:"0.72rem", fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.title}</span>
              <div style={{ display:"flex", alignItems:"center", gap:"0.25rem", background:"rgba(255,255,255,0.07)", borderRadius:6, padding:"0.2rem 0.5rem", fontSize:"0.72rem", color:"rgba(255,255,255,0.7)" }}>
                <span>◄</span>
                <span style={{ fontWeight:700, color:WHITE, minWidth:18, textAlign:"center" }}>{presState.page}</span>
                <span style={{ color:"rgba(255,255,255,0.3)" }}>/</span>
                <span>—</span>
                <span>►</span>
              </div>
              <button type="button" onClick={toggleFullscreen} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.7)", borderRadius:5, padding:"0.2rem 0.45rem", cursor:"pointer", fontSize:"0.75rem" }}>⛶</button>
            </>
          ) : (
            <span style={{ color:"rgba(255,255,255,0.4)", fontSize:"0.72rem" }}>Waiting for instructor…</span>
          )}
        </div>

        {/* Slide area — overflow:auto so content can scroll on mobile */}
        <div ref={stageRef} style={{ flex:1, overflow:"auto", background:"#f9f5f5", position:"relative", minHeight:0, WebkitOverflowScrolling:"touch" as React.CSSProperties["WebkitOverflowScrolling"], ...(isFullscreen ? { position:"fixed", inset:0, zIndex:9999, height:"100dvh", width:"100vw" } as React.CSSProperties : {}) }}>
          {screenShareTrack ? (
            <ScreenShareViewer track={screenShareTrack} />
          ) : selected && previewable ? (
            <iframe
              key={`${selected.id}-p${presState.page}`}
              title={selected.title}


              src={`/api/learning/materials/${selected.id}?view=inline&page=${presState.page}${selected.mimeType === "application/pdf" ? "#toolbar=0&navpanes=0&scrollbar=0" : ""}`}
              style={{ width:"100%", height:"100%", minHeight:"60vh", border:0, display:"block" }}
            />
          ) : (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:"0.75rem", padding:"2rem" }}>
              <span style={{ fontSize:"3rem" }}>📊</span>
              <p style={{ margin:0, fontWeight:700, fontSize:"0.95rem", color:WINE }}>
                {selected ? selected.title : "Waiting for instructor…"}
              </p>
              <p style={{ margin:0, fontSize:"0.78rem", color:"#9b5c5c" }}>
                {selected ? "This file cannot be previewed." : "Slides will appear here automatically."}
              </p>
            </div>
          )}

          {/* Instructor PiP */}
          <div style={{ position:"absolute", top:"0.55rem", right:"0.55rem", zIndex:20 }}>
            <div style={{ width:100, borderRadius:8, overflow:"hidden", border:`2px solid ${GOLD}`, background:BG2, marginBottom:"0.3rem" }}>
              <ClassroomVideoFeed classId={learningClass.id} onRoomReady={setActiveRoom} onPresentationState={handlePresentationState} onScreenShareTrack={setScreenShareTrack} onLocalAudioTrack={setLocalAudioTrack} pipMode />
            </div>
            <ClassroomPollOverlay classId={learningClass.id} />
          </div>
        </div>

        {/* Bottom controls */}
        <div style={{ background:BG2, borderTop:"1px solid rgba(255,255,255,0.07)", padding:"0.45rem 0.4rem calc(0.45rem + env(safe-area-inset-bottom,0px))", display:"flex", alignItems:"center", justifyContent:"space-around", flexShrink:0 }}>
          {([
            { icon:"📁", label:"Materials", tab:"materials" as const },
            { icon:"💬", label:"Chat",      tab:"chat"      as const },
            { icon:"❓", label:"Q&A",       tab:"qa"        as const },
            { icon:"ℹ️", label:"Info",      tab:"info"      as const },
          ]).map(({ icon, label, tab }) => (
            <button key={tab} type="button" onClick={() => { setSheetTab(tab); setShowSheet(true); }}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"0.55rem 0.75rem", color:"rgba(255,255,255,0.82)", cursor:"pointer", minWidth:56, WebkitTapHighlightColor:"transparent" }}>
              <span style={{ fontSize:"1.15rem" }}>{icon}</span>
              <span style={{ fontSize:"0.58rem", fontWeight:700 }}>{label}</span>
            </button>
          ))}
          
          <button type="button" onClick={toggleRaiseHand}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:isHandRaised?GOLD:"rgba(255,255,255,0.05)", border:isHandRaised?`1px solid ${GOLDD}`:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"0.55rem 0.75rem", color:isHandRaised?INK:"rgba(255,255,255,0.82)", cursor:"pointer", minWidth:56, WebkitTapHighlightColor:"transparent", transition:"all 0.2s ease" }}>
            <span style={{ fontSize:"1.15rem" }}>✋</span>
            <span style={{ fontSize:"0.58rem", fontWeight:700 }}>{isHandRaised ? "Raised" : "Raise Hand"}</span>
          </button>
          <Link href="/learning" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.22rem", background:RED_BTN, color:WHITE, borderRadius:12, padding:"0.55rem 0.75rem", fontWeight:700, fontSize:"0.58rem", textDecoration:"none", minWidth:56, WebkitTapHighlightColor:"transparent" }}>
            <span style={{ fontSize:"1.15rem" }}>🚪</span>
            <span>Leave</span>
          </Link>
        </div>

        {/* Bottom sheet */}
        {showSheet && (
          <>
            <div onClick={() => setShowSheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:40, backdropFilter:"blur(3px)" }} />
            <div style={{ position:"fixed", left:0, right:0, bottom:0, zIndex:50, background:BG2, borderTop:`2px solid ${WINE2}`, borderRadius:"20px 20px 0 0", height:"75dvh", display:"flex", flexDirection:"column", boxShadow:"0 -8px 40px rgba(0,0,0,0.65)", animation:"nakSlideUp 0.28s cubic-bezier(.32,.72,0,1)" }}>
              <div style={{ display:"flex", justifyContent:"center", padding:"0.6rem 0 0.25rem" }}>
                <div style={{ width:36, height:4, borderRadius:99, background:"rgba(255,255,255,0.18)" }} />
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 1rem 0.4rem" }}>
                <span style={{ fontWeight:700, fontSize:"0.88rem", color:WHITE }}>
                  {sheetTab==="materials"?"Materials":sheetTab==="chat"?"Chat":sheetTab==="qa"?"Q&A":"Class Info"}
                </span>
                <button onClick={() => setShowSheet(false)} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:"50%", width:30, height:30, color:"rgba(255,255,255,0.7)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.9rem" }}>✕</button>
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <PanelContent dark />
              </div>
            </div>
          </>
        )}

        <style>{`@keyframes nakSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /* DESKTOP LAYOUT                                                           */
  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:"100dvh", background:BG, color:WHITE, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif", display:"flex", flexDirection:"column" }}>

      {/* Top bar */}
      <header style={{ background:BG2, borderBottom:BORDER, height:56, padding:"0 1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"1rem", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem", minWidth:0 }}>
          <NakLogo light />
          <div style={{ width:1, height:32, background:BORDER }} />
          <div style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.35rem", flexWrap:"wrap" }}>
              <span style={{ color:GRAY2, fontSize:"0.72rem" }}>{learningClass.course}</span>
              <span style={{ color:GRAY2, fontSize:"0.65rem" }}>›</span>
              <span style={{ color:WHITE, fontSize:"0.78rem", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:220 }}>
                {learningClass.module ?? learningClass.title}
              </span>
            </div>
          </div>
          <div style={{ background:RED_BTN, color:WHITE, fontWeight:800, fontSize:"0.7rem", padding:"0.22rem 0.6rem", borderRadius:99, letterSpacing:"0.06em", display:"flex", alignItems:"center", gap:"0.28rem", flexShrink:0 }}>
            <span style={{ width:5, height:5, borderRadius:"50%", background:WHITE, display:"inline-block" }} />LIVE
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", color:GRAY2, fontSize:"0.8rem" }}>
            🕐 {fmtTime(elapsed)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.3rem" }}>
            <span style={{ width:7, height:7, borderRadius:"50%", background:GREEN, display:"inline-block" }} />
            <span style={{ color:GREEN, fontSize:"0.72rem", fontWeight:600 }}>Connected</span>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", flexShrink:0 }}>
          <span style={{ fontSize:"1.1rem", cursor:"pointer", color:GRAY2 }}>🔔</span>
          <div style={{ display:"flex", alignItems:"center", gap:"0.45rem" }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:GOLD, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.9rem" }}>S</div>
            <div>
              <div style={{ color:WHITE, fontSize:"0.78rem", fontWeight:700 }}>Student</div>
              <div style={{ color:GOLD, fontSize:"0.6rem" }}>Learner</div>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* Left panel */}
        <div style={{ width:262, borderRight:BORDER, display:"flex", flexDirection:"column", flexShrink:0, overflow:"hidden" }}>
          <PanelContent />
        </div>

        {/* Center */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          {/* PDF nav bar */}
          <div style={{ background:BG2, borderBottom:BORDER, padding:"0.4rem 1rem", display:"flex", alignItems:"center", gap:"0.75rem", flexShrink:0 }}>
            {selected ? (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", background:BG3, borderRadius:6, padding:"0.22rem 0.65rem" }}>
                  <FileTypeBadge mimeType={selected.mimeType} size="small" />
                  <span style={{ color:WHITE, fontSize:"0.75rem", fontWeight:600, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.title}</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"0.3rem", color:GRAY2, fontSize:"0.78rem" }}>
                  <span style={{ cursor:"pointer" }}>◄</span>
                  <span style={{ fontWeight:700, color:WHITE }}>{presState.page}</span>
                  <span style={{ color:GRAY2 }}>/</span>
                  <span>—</span>
                  <span style={{ cursor:"pointer" }}>►</span>
                </div>
              </>
            ) : (
              <span style={{ color:GRAY2, fontSize:"0.78rem" }}>Waiting for instructor…</span>
            )}
            <div style={{ marginLeft:"auto", display:"flex", gap:"0.4rem" }}>
              <button style={{ background:BG3, border:BORDER, color:GRAY2, borderRadius:5, padding:"0.22rem 0.5rem", cursor:"pointer", fontSize:"0.72rem" }}>100%</button>
              <button type="button" onClick={toggleFullscreen} style={{ background:BG3, border:BORDER, color:GRAY2, borderRadius:5, padding:"0.22rem 0.5rem", cursor:"pointer", fontSize:"0.75rem" }}>⛶</button>
            </div>
          </div>

          {/* Slide area */}
          <div ref={stageRef} style={{ flex:1, overflow:"hidden", background:"#f9f5f5", position:"relative", ...(isFullscreen ? { position:"fixed", inset:0, zIndex:9999, height:"100dvh", width:"100vw" } as React.CSSProperties : {}) }}>
            {screenShareTrack ? (
            <ScreenShareViewer track={screenShareTrack} />
          ) : selected && previewable ? (
              <iframe
                key={`${selected.id}-p${presState.page}`}
                title={selected.title}
                src={`/api/learning/materials/${selected.id}?view=inline&page=${presState.page}${selected.mimeType === "application/pdf" ? "#toolbar=0&navpanes=0&scrollbar=0" : ""}`}
                style={{ width:"100%", height:"100%", border:0 }}
              />
            ) : (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:"0.75rem" }}>
                <span style={{ fontSize:"3.5rem" }}>📊</span>
                <p style={{ margin:0, fontWeight:700, fontSize:"1rem", color:WINE }}>
                  {selected ? selected.title : "Waiting for instructor…"}
                </p>
                <p style={{ margin:0, fontSize:"0.82rem", color:"#9b5c5c" }}>
                  {selected ? "This file cannot be previewed." : "The presentation will appear here automatically."}
                </p>
              </div>
            )}
            {/* Instructor PiP */}
            <div style={{ position:"absolute", top:"0.65rem", right:"0.65rem", zIndex:20, width:120, borderRadius:10, overflow:"hidden", border:`2px solid ${GOLD}`, boxShadow:"0 4px 16px rgba(0,0,0,0.4)", background:BG2 }}>
              <ClassroomVideoFeed classId={learningClass.id} onRoomReady={setActiveRoom} onPresentationState={handlePresentationState} onScreenShareTrack={setScreenShareTrack} onLocalAudioTrack={setLocalAudioTrack} pipMode />
            </div>
            <div style={{ position:"absolute", top:"0.65rem", right:"0.65rem", zIndex:21 }}>
              <ClassroomPollOverlay classId={learningClass.id} />
            </div>
          </div>

          {/* Video strip */}
          <div style={{ background:BG, borderTop:BORDER, padding:"0.6rem 1rem", display:"flex", gap:"0.6rem", overflowX:"auto", flexShrink:0, alignItems:"center" }}>
            <p style={{ margin:"0 0.25rem 0 0", color:GRAY2, fontSize:"0.72rem", whiteSpace:"nowrap", flexShrink:0 }}>Your camera →</p>
            <div style={{ width:120, height:80, borderRadius:8, background:BG2, border:`2px solid ${GOLD}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", bottom:"0.25rem", left:0, right:0, textAlign:"center", fontSize:"0.6rem", color:GOLD, fontWeight:700 }}>You (Live)</div>
            </div>
            <div style={{ width:120, height:80, borderRadius:8, background:BG3, border:`1px solid ${BORDER}`, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:"0.2rem" }}>
              <span style={{ fontSize:"1.2rem" }}>👤</span>
              <span style={{ fontSize:"0.58rem", color:GRAY2 }}>Instructor</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width:300, borderLeft:BORDER, background:BG2, display:"flex", flexDirection:"column", flexShrink:0 }}>
          <div style={{ display:"flex", background:BG, borderBottom:BORDER }}>
            {(["participants","chat"] as const).map(t => (
              <button key={t} type="button" onClick={() => setRightTab(t)}
                style={{ flex:1, background:"transparent", border:"none", borderBottom:rightTab===t?`2px solid ${WINE2}`:"2px solid transparent", color:rightTab===t?WINE2:GRAY2, padding:"0.72rem 0.5rem", fontSize:"0.7rem", fontWeight:700, cursor:"pointer" }}>
                {t==="participants" ? "👥 Participants" : "💬 Chat"}
              </button>
            ))}
          </div>

          {rightTab === "participants" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ padding:"0.65rem 0.85rem", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:BORDER }}>
                <span style={{ fontWeight:700, fontSize:"0.82rem", color:WHITE }}>Participants</span>
                <span style={{ color:GOLD, fontSize:"0.75rem", cursor:"pointer" }}>View All</span>
              </div>
              <div style={{ padding:"0.5rem 0.6rem" }}>
                <div style={{ display:"flex", alignItems:"center", background:BG3, border:BORDER, borderRadius:7, padding:"0.35rem 0.55rem", gap:"0.35rem", marginBottom:"0.5rem" }}>
                  <span style={{ color:GRAY2, fontSize:"0.8rem" }}>🔍</span>
                  <input placeholder="Search participants…" style={{ flex:1, border:"none", outline:"none", fontSize:"0.75rem", color:WHITE, background:"transparent" }} />
                </div>
              </div>
              <div style={{ flex:1, overflowY:"auto" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", padding:"0.45rem 0.85rem", borderBottom:BORDER }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:GOLD, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.9rem" }}>S</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:"0.8rem", color:WHITE }}>Student (You)</div>
                    <div style={{ fontSize:"0.62rem", color:GRAY2 }}>Learner</div>
                  </div>
                  <div style={{ display:"flex", gap:"0.2rem" }}>
                    <span style={{ fontSize:"0.8rem", color:GRAY2 }}>🎤</span>
                    <span style={{ fontSize:"0.8rem", color:GRAY2 }}>📷</span>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:"0.6rem", padding:"0.45rem 0.85rem", borderBottom:BORDER }}>
                  <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${GOLDD},#f6de88)`, color:INK, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"0.9rem" }}>
                    {(learningClass.instructor ?? "I").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:"0.8rem", color:WHITE }}>{learningClass.instructor ?? "Instructor"}</div>
                    <div style={{ background:"rgba(212,168,67,0.2)", color:GOLDD, fontSize:"0.55rem", fontWeight:800, padding:"0.08rem 0.35rem", borderRadius:3, display:"inline-block" }}>HOST</div>
                  </div>
                  <div style={{ display:"flex", gap:"0.2rem" }}>
                    <span style={{ fontSize:"0.8rem", color:GREEN }}>🎤</span>
                    <span style={{ fontSize:"0.8rem", color:GREEN }}>📷</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {rightTab === "chat" && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              <div style={{ flex:1, overflowY:"auto" }}>
                <ClassroomChat classId={learningClass.id} room={activeRoom} isInstructor={false} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom control bar */}
      <div style={{ background:BG2, borderTop:BORDER, padding:"0.45rem 1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", background:BG3, border:BORDER, borderRadius:8, padding:"0.4rem 0.75rem", cursor:"pointer" }}>
          <span style={{ fontSize:"0.85rem" }}>🖥️</span>
          <div>
            <div style={{ color:GRAY2, fontSize:"0.58rem" }}>Classroom Mode</div>
            <div style={{ color:WHITE, fontSize:"0.7rem", fontWeight:700 }}>Lecture Mode</div>
          </div>
          <span style={{ color:GRAY2, fontSize:"0.65rem" }}>▾</span>
        </div>
        <div style={{ display:"flex", gap:"0.2rem" }}>
          {[
            { icon:"🎤", label:"Mic" },
            { icon:"📷", label:"Camera" },
            { icon:"✋", label: isHandRaised ? "Raised" : "Raise Hand", isRaiseHand: true },
            { icon:"📤", label:"Present", gold:true },
            { icon:"📁", label:"Materials" },
            { icon:"👥", label:"Participants" },
            { icon:"💬", label:"Chat" },
            { icon:"❓", label:"Q&A" },
            { icon:"⋯", label:"More" },
          ].map((item: any) => (
            <button key={item.label} type="button"
              onClick={item.isRaiseHand ? toggleRaiseHand : undefined}
              style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.12rem", background:item.isRaiseHand && isHandRaised ? GOLD : item.gold ? WINE2 : "transparent", border:item.isRaiseHand && isHandRaised ? `1px solid ${GOLDD}` : "1px solid transparent", color:item.isRaiseHand && isHandRaised ? INK : item.gold ? WHITE : GRAY2, borderRadius:8, padding:"0.4rem 0.6rem", cursor:"pointer", minWidth:48, transition:"all 0.2s ease" }}>
              <span style={{ fontSize:"1.1rem" }}>{item.icon}</span>
              <span style={{ fontSize:"0.56rem", fontWeight:600, letterSpacing:"0.02em" }}>{item.label}</span>
            </button>
          ))}
        </div>
        <Link href="/learning" style={{ display:"flex", alignItems:"center", gap:"0.4rem", background:RED_BTN, color:WHITE, borderRadius:8, padding:"0.55rem 1.2rem", fontWeight:700, fontSize:"0.85rem", textDecoration:"none" }}>
          Leave
        </Link>
      </div>
    </div>
  );
}


