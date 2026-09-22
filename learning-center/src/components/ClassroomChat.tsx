"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isInstructor: boolean;
};

export type QAQuestion = {
  id: string;
  authorId: string;
  authorName: string;
  questionText: string;
  upvotes: number;
  upvotedBy: string[];
  isAnswered: boolean;
  timestamp: number;
};

export default function ClassroomChat({
  classId,
  room,
  isInstructor,
  userId = "user-local",
  userName = isInstructor ? "Instructor" : "Student",
  initialTab = "chat",
}: {
  classId: string;
  room: Room | null;
  isInstructor: boolean;
  userId?: string;
  userName?: string;
  initialTab?: "chat" | "qa";
}) {
  const [activeTab, setActiveTab] = useState<"chat" | "qa">(initialTab);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questions, setQuestions] = useState<QAQuestion[]>([]);
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<string | null>(null);

  const [inputMsg, setInputMsg] = useState("");
  const [inputQuestion, setInputQuestion] = useState("");
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinText, setPinText] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const historyLoadedRef = useRef(false);

  // Panels can be closed and reopened while a class is live. Retain this
  // browser's room history so reopening Chat or Q&A does not look empty.
  useEffect(() => {
    historyLoadedRef.current = false;
    try {
      const saved = sessionStorage.getItem(`nak-classroom-history-${classId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as { messages?: ChatMessage[]; questions?: QAQuestion[]; pinnedAnnouncement?: string | null };
        setMessages(parsed.messages ?? []);
        setQuestions(parsed.questions ?? []);
        setPinnedAnnouncement(parsed.pinnedAnnouncement ?? null);
      }
    } catch {
      // A malformed or unavailable browser store should never break chat.
    }
    historyLoadedRef.current = true;
  }, [classId]);

  useEffect(() => {
    if (!historyLoadedRef.current) return;
    try {
      sessionStorage.setItem(
        `nak-classroom-history-${classId}`,
        JSON.stringify({ messages, questions, pinnedAnnouncement })
      );
    } catch {
      // Storage is optional (for example, private browser modes may deny it).
    }
  }, [classId, messages, questions, pinnedAnnouncement]);

  // Scroll to bottom on new chat message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // BroadcastChannel & LiveKit DataChannel Setup
  useEffect(() => {
    let bc: BroadcastChannel | undefined;

    try {
      bc = new BroadcastChannel(`nak-classroom-chat-${classId}`);
      bcRef.current = bc;

      bc.onmessage = (event) => {
        const payload = event.data;
        if (!payload || !payload.type) return;
        handleIncomingSignal(payload);
      };
    } catch {
      // BroadcastChannel unavailable
    }

    if (room) {
      const handleData = (data: Uint8Array) => {
        try {
          const str = new TextDecoder().decode(data);
          const payload = JSON.parse(str);
          handleIncomingSignal(payload);
        } catch {
          // Non-JSON payload
        }
      };

      room.on(RoomEvent.DataReceived, handleData);
      return () => {
        room.off(RoomEvent.DataReceived, handleData);
        if (bc) bc.close();
      };
    }

    return () => {
      if (bc) bc.close();
    };
  }, [classId, room]);

  const handleIncomingSignal = (payload: any) => {
    if (payload.type === "CHAT_MSG") {
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    } else if (payload.type === "PIN_ANNOUNCEMENT") {
      setPinnedAnnouncement(payload.text);
    } else if (payload.type === "DELETE_MSG") {
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    } else if (payload.type === "QA_QUESTION") {
      setQuestions((prev) => {
        if (prev.some((q) => q.id === payload.question.id)) return prev;
        return [...prev, payload.question];
      });
    } else if (payload.type === "UPVOTE_QUESTION") {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id === payload.questionId) {
            if (q.upvotedBy.includes(payload.userId)) return q;
            return {
              ...q,
              upvotes: q.upvotes + 1,
              upvotedBy: [...q.upvotedBy, payload.userId],
            };
          }
          return q;
        })
      );
    } else if (payload.type === "ANSWER_QUESTION") {
      setQuestions((prev) =>
        prev.map((q) => (q.id === payload.questionId ? { ...q, isAnswered: true } : q))
      );
    }
  };

  const broadcastSignal = (payload: any) => {
    handleIncomingSignal(payload);

    if (bcRef.current) {
      bcRef.current.postMessage(payload);
    }

    if (room) {
      try {
        const data = new TextEncoder().encode(JSON.stringify(payload));
        void room.localParticipant.publishData(data, { reliable: true });
      } catch {
        // Failed to publish via LiveKit room
      }
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      senderId: userId,
      senderName: userName,
      text: inputMsg.trim(),
      timestamp: Date.now(),
      isInstructor,
    };

    broadcastSignal({ type: "CHAT_MSG", message: newMsg });
    setInputMsg("");
  };

  const handleSendQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuestion.trim()) return;

    const newQ: QAQuestion = {
      id: `qa-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      authorId: userId,
      authorName: userName,
      questionText: inputQuestion.trim(),
      upvotes: 1,
      upvotedBy: [userId],
      isAnswered: false,
      timestamp: Date.now(),
    };

    broadcastSignal({ type: "QA_QUESTION", question: newQ });
    setInputQuestion("");
  };

  const handleUpvoteQuestion = (qId: string) => {
    broadcastSignal({ type: "UPVOTE_QUESTION", questionId: qId, userId });
  };

  const handleMarkAnswered = (qId: string) => {
    broadcastSignal({ type: "ANSWER_QUESTION", questionId: qId });
  };

  const handlePinAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinText.trim()) return;
    broadcastSignal({ type: "PIN_ANNOUNCEMENT", text: pinText.trim() });
    setPinText("");
    setShowPinInput(false);
  };

  const handleDeleteMessage = (msgId: string) => {
    broadcastSignal({ type: "DELETE_MSG", messageId: msgId });
  };

  return (
    <div style={container}>
      {/* Tab Selector */}
      <div style={tabHeader}>
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          style={{ ...tabBtn, ...(activeTab === "chat" ? activeTabBtn : {}) }}
        >
          Chat ({messages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("qa")}
          style={{ ...tabBtn, ...(activeTab === "qa" ? activeTabBtn : {}) }}
        >
          Q&A ({questions.filter((q) => !q.isAnswered).length})
        </button>
      </div>

      {/* Pinned Announcement Banner */}
      {pinnedAnnouncement && (
        <div style={pinnedBanner}>
          <div style={pinnedHeader}>
            <span style={pinnedTag}>INSTRUCTOR ANNOUNCEMENT</span>
            {isInstructor && (
              <button
                type="button"
                onClick={() => broadcastSignal({ type: "PIN_ANNOUNCEMENT", text: null })}
                style={clearPinBtn}
              >
                Clear
              </button>
            )}
          </div>
          <p style={pinnedText}>{pinnedAnnouncement}</p>
        </div>
      )}

      {/* Instructor Pin Form Toggle */}
      {isInstructor && activeTab === "chat" && (
        <div style={pinToggleRow}>
          <button
            type="button"
            onClick={() => setShowPinInput(!showPinInput)}
            style={pinToggleBtn}
          >
            {showPinInput ? "Cancel Pin" : "Pin New Announcement"}
          </button>

          {showPinInput && (
            <form onSubmit={handlePinAnnouncement} style={pinForm}>
              <input
                type="text"
                value={pinText}
                onChange={(e) => setPinText(e.target.value)}
                placeholder="Type announcement to pin at top of chat..."
                style={pinInput}
              />
              <button type="submit" style={pinSubmitBtn}>
                Pin Announcement
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 1: GENERAL CHAT */}
      {activeTab === "chat" && (
        <div style={chatViewport}>
          <div style={messageList}>
            {messages.length === 0 ? (
              <p style={emptyText}>No messages yet. Start the classroom discussion!</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} style={{ ...msgCard, ...(m.isInstructor ? instructorMsgCard : {}) }}>
                  <div style={msgMetaRow}>
                    <strong style={{ ...msgAuthor, ...(m.isInstructor ? instructorAuthor : {}) }}>
                      {m.senderName} {m.senderId === userId ? "(You)" : ""}
                    </strong>
                    <span style={msgTime}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p style={msgText}>{m.text}</p>

                  {isInstructor && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(m.id)}
                      style={deleteMsgBtn}
                      title="Delete message"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendChat} style={inputRow}>
            <input
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              placeholder="Send message to classroom..."
              style={textInput}
            />
            <button type="submit" style={sendBtn}>
              Send
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: INTERACTIVE Q&A */}
      {activeTab === "qa" && (
        <div style={chatViewport}>
          <div style={messageList}>
            {questions.length === 0 ? (
              <p style={emptyText}>No questions asked yet. Ask a question for the instructor!</p>
            ) : (
              questions
                .sort((a, b) => b.upvotes - a.upvotes)
                .map((q) => (
                  <div
                    key={q.id}
                    style={{ ...qaCard, ...(q.isAnswered ? answeredQaCard : {}) }}
                  >
                    <div style={qaHeader}>
                      <div>
                        <strong style={qaAuthor}>{q.authorName}</strong>
                        {q.isAnswered && <span style={answeredBadge}>ANSWERED LIVE</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUpvoteQuestion(q.id)}
                        disabled={q.upvotedBy.includes(userId)}
                        style={{ ...upvoteBtn, ...(q.upvotedBy.includes(userId) ? activeUpvoteBtn : {}) }}
                      >
                        Upvotes: {q.upvotes}
                      </button>
                    </div>

                    <p style={qaText}>{q.questionText}</p>

                    {isInstructor && !q.isAnswered && (
                      <button
                        type="button"
                        onClick={() => handleMarkAnswered(q.id)}
                        style={markAnsweredBtn}
                      >
                        Mark Answered Live
                      </button>
                    )}
                  </div>
                ))
            )}
          </div>

          <form onSubmit={handleSendQuestion} style={inputRow}>
            <input
              type="text"
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              placeholder="Ask a question for live Q&A..."
              style={textInput}
            />
            <button type="submit" style={sendBtn}>
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Styling Tokens
const container = {
  display: "flex",
  flexDirection: "column",
  background: "#180c0b",
  border: "1px solid #3b2220",
  borderRadius: 8,
  overflow: "hidden",
  height: 480,
} as const;

const tabHeader = {
  display: "flex",
  background: "#100707",
  borderBottom: "1px solid #3b2220",
} as const;

const tabBtn = {
  flex: 1,
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  color: "#a38b80",
  padding: "0.6rem",
  fontSize: "0.8rem",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const activeTabBtn = {
  color: "#ffd98a",
  borderBottomColor: "#98661B",
  background: "#180c0b",
} as const;

const pinnedBanner = {
  background: "#331808",
  borderBottom: "1px solid #98661B",
  padding: "0.55rem 0.75rem",
} as const;

const pinnedHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.2rem",
} as const;

const pinnedTag = {
  color: "#ffd98a",
  fontSize: "0.68rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
} as const;

const clearPinBtn = {
  background: "transparent",
  border: "none",
  color: "#ff6b6b",
  fontSize: "0.7rem",
  cursor: "pointer",
} as const;

const pinnedText = {
  margin: 0,
  fontSize: "0.82rem",
  color: "#fff",
  lineHeight: 1.4,
} as const;

const pinToggleRow = {
  padding: "0.4rem 0.6rem",
  background: "#120a09",
  borderBottom: "1px solid #2e1615",
} as const;

const pinToggleBtn = {
  background: "#2b1615",
  color: "#ffd98a",
  border: "1px solid #98661B",
  borderRadius: 4,
  padding: "0.25rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer",
} as const;

const pinForm = {
  display: "flex",
  gap: "0.4rem",
  marginTop: "0.4rem",
} as const;

const pinInput = {
  flex: 1,
  background: "#100707",
  border: "1px solid #98661B",
  borderRadius: 4,
  padding: "0.3rem 0.5rem",
  color: "#fff",
  fontSize: "0.78rem",
  outline: "none",
} as const;

const pinSubmitBtn = {
  background: "#98661B",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "0.3rem 0.65rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const chatViewport = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
} as const;

const messageList = {
  flex: 1,
  overflowY: "auto",
  padding: "0.65rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
} as const;

const emptyText = {
  color: "#8c766b",
  fontSize: "0.8rem",
  textAlign: "center",
  margin: "auto",
  fontStyle: "italic",
} as const;

const msgCard = {
  position: "relative",
  background: "#241211",
  border: "1px solid #3b2220",
  borderRadius: 6,
  padding: "0.45rem 0.65rem",
} as const;

const instructorMsgCard = {
  background: "#331414",
  borderColor: "#98661B",
} as const;

const msgMetaRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.15rem",
} as const;

const msgAuthor = {
  fontSize: "0.78rem",
  color: "#d4b684",
} as const;

const instructorAuthor = {
  color: "#ffd98a",
} as const;

const msgTime = {
  fontSize: "0.68rem",
  color: "#8c766b",
} as const;

const msgText = {
  margin: 0,
  fontSize: "0.82rem",
  color: "#fff",
  lineHeight: 1.4,
} as const;

const deleteMsgBtn = {
  position: "absolute",
  top: "0.3rem",
  right: "0.3rem",
  background: "transparent",
  border: "none",
  fontSize: "0.7rem",
  cursor: "pointer",
  opacity: 0.7,
} as const;

const inputRow = {
  display: "flex",
  gap: "0.4rem",
  padding: "0.5rem",
  background: "#100707",
  borderTop: "1px solid #3b2220",
} as const;

const textInput = {
  flex: 1,
  background: "#1e100f",
  border: "1px solid #3b2220",
  borderRadius: 4,
  padding: "0.45rem 0.65rem",
  color: "#fff",
  fontSize: "0.8rem",
  outline: "none",
} as const;

const sendBtn = {
  background: "#98661B",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "0.45rem 0.85rem",
  fontSize: "0.8rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const qaCard = {
  background: "#241211",
  border: "1px solid #3b2220",
  borderRadius: 6,
  padding: "0.55rem 0.7rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
} as const;

const answeredQaCard = {
  opacity: 0.6,
  borderColor: "#2e5938",
} as const;

const qaHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const qaAuthor = {
  fontSize: "0.8rem",
  color: "#ffd98a",
} as const;

const answeredBadge = {
  fontSize: "0.68rem",
  color: "#4dff88",
  fontWeight: 700,
  marginLeft: "0.4rem",
} as const;

const upvoteBtn = {
  background: "#180c0b",
  border: "1px solid #3b2220",
  color: "#d4b684",
  borderRadius: 4,
  padding: "0.2rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;

const activeUpvoteBtn = {
  background: "#4d2508",
  borderColor: "#98661B",
  color: "#ffd98a",
} as const;

const qaText = {
  margin: 0,
  fontSize: "0.83rem",
  color: "#fff",
  lineHeight: 1.4,
} as const;

const markAnsweredBtn = {
  alignSelf: "flex-start",
  background: "#2e5938",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  padding: "0.25rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 700,
  cursor: "pointer",
} as const;
