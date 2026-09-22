/**
 * Local WebRTC P2P Peer Connection helper for Nakconel Classroom
 * Enables real-time 2-way audio & video calling across browser tabs without cloud servers.
 */

export class LocalClassroomPeer {
  private pc: RTCPeerConnection | null = null;
  private bc: BroadcastChannel | null = null;
  private classId: string;
  private role: "instructor" | "student";
  private remoteStream: MediaStream = new MediaStream();
  private pingTimer?: NodeJS.Timeout;

  public onRemoteStream?: (stream: MediaStream) => void;
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;

  constructor(classId: string, role: "instructor" | "student") {
    this.classId = classId;
    this.role = role;
    this.init();
  }

  private init() {
    try {
      this.bc = new BroadcastChannel(`nak-p2p-signal-${this.classId}`);
      this.bc.onmessage = async (event) => {
        const msg = event.data;
        if (!msg || !msg.senderRole || msg.senderRole === this.role) return;

        if (msg.type === "OFFER" && this.role === "student") {
          await this.handleOffer(msg.sdp);
        } else if (msg.type === "ANSWER" && this.role === "instructor") {
          await this.handleAnswer(msg.sdp);
        } else if (msg.type === "ICE_CANDIDATE") {
          await this.handleIceCandidate(msg.candidate);
        } else if (msg.type === "PING_CALL" && this.role === "instructor") {
          void this.createOffer();
        }
      };

      this.createPeerConnection();

      if (this.role === "student") {
        this.bc.postMessage({ type: "PING_CALL", senderRole: this.role });
        this.pingTimer = setInterval(() => {
          if (this.bc && (!this.pc || this.pc.connectionState !== "connected")) {
            this.bc.postMessage({ type: "PING_CALL", senderRole: this.role });
          }
        }, 1500);
      }
    } catch (err) {
      console.error("LocalP2P initialization error:", err);
    }
  }

  private createPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.bc) {
        this.bc.postMessage({
          type: "ICE_CANDIDATE",
          candidate: event.candidate.toJSON(),
          senderRole: this.role,
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.track) {
        // Accumulate tracks into a unified MediaStream instance
        const existingTracks = this.remoteStream.getTracks();
        if (!existingTracks.some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
        this.onRemoteStream?.(this.remoteStream);
      } else if (event.streams && event.streams[0]) {
        this.onRemoteStream?.(event.streams[0]);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.onConnectionStateChange?.(this.pc.connectionState);
      }
    };
  }

  public addLocalStream(stream: MediaStream) {
    if (!this.pc) return;
    for (const track of stream.getTracks()) {
      const senders = this.pc.getSenders();
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        void existing.replaceTrack(track);
      } else {
        this.pc.addTrack(track, stream);
      }
    }

    if (this.role === "instructor") {
      void this.createOffer();
    } else if (this.role === "student" && this.bc) {
      this.bc.postMessage({ type: "PING_CALL", senderRole: this.role });
    }
  }

  public async createOffer() {
    if (!this.pc || !this.bc) return;
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.pc.setLocalDescription(offer);
      this.bc.postMessage({
        type: "OFFER",
        sdp: { type: offer.type, sdp: offer.sdp },
        senderRole: this.role,
      });
    } catch (err) {
      console.error("Error creating WebRTC P2P offer:", err);
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc || !this.bc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.bc.postMessage({
        type: "ANSWER",
        sdp: { type: answer.type, sdp: answer.sdp },
        senderRole: this.role,
      });
    } catch (err) {
      console.error("Error handling WebRTC P2P offer:", err);
    }
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) {
      console.error("Error handling WebRTC P2P answer:", err);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Ice candidate error
    }
  }

  public destroy() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.bc) {
      this.bc.close();
      this.bc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
