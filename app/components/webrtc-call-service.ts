import type { DataConnection, MediaConnection } from "peerjs";

export type ComprehensionReactionType =
  | "understood" // 👍 Entendi perfeitamente
  | "repeat" // 🔄 Pode repetir?
  | "wait" // ⏳ Um momento...
  | "agree" // 👏 Concordo
  | "question"; // ❓ Tenho uma dúvida

export interface ComprehensionReactionMeta {
  id: ComprehensionReactionType;
  label: string;
  emoji: string;
  shortText: string;
}

export const COMPREHENSION_REACTIONS: ComprehensionReactionMeta[] = [
  { id: "understood", label: "Entendi perfeitamente", emoji: "👍", shortText: "Entendi" },
  { id: "repeat", label: "Pode repetir de forma mais simples?", emoji: "🔄", shortText: "Pode repetir?" },
  { id: "wait", label: "Um momento, por favor...", emoji: "⏳", shortText: "Um momento..." },
  { id: "agree", label: "Concordo / Perfeito!", emoji: "👏", shortText: "Concordo" },
  { id: "question", label: "Tenho uma dúvida", emoji: "❓", shortText: "Tenho dúvida" },
];

export type P2PPayload =
  | { type: "transcript"; text: string; sender: "signer" | "listener"; timestamp?: string }
  | { type: "reaction"; reaction: ComprehensionReactionType; timestamp?: string }
  | { type: "chat"; text: string; sender: "signer" | "listener"; timestamp?: string }
  | { type: "glosses"; glosses: string[] };

export type CallStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

/**
 * Configuração resiliente de ICE com STUN Google e TURN OpenRelay/Metered
 * Essencial para atravessar NATs simétricos, CGNAT de celulares (4G/5G) e firewalls
 */
export const PEER_ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turn:global.relay.metered.ca:443?transport=tcp",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "openrelay",
      credential: "openrelay",
    },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Gera um código legível de sala de 6 caracteres (ex: HS-8421)
 */
export function generateRoomCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem 0, O, 1, I para evitar confusão
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `HS-${code}`;
}

/**
 * Normaliza o código da sala inserido pelo usuário
 */
export function normalizeRoomCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (cleaned.startsWith("HS-")) return cleaned;
  if (cleaned.startsWith("HS")) return `HS-${cleaned.slice(2)}`;
  return `HS-${cleaned}`;
}

export interface WebRTCCallCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onDataMessage?: (payload: P2PPayload) => void;
  onCallStatusChange?: (status: CallStatus) => void;
  onStatusDetailChange?: (detail: string) => void;
  onError?: (errorMessage: string) => void;
}

/**
 * Gerenciador de Chamadas WebRTC P2P (PeerJS) 100% no Cliente
 */
export class WebRTCCallService {
  private peer: any = null;
  private currentCall: MediaConnection | null = null;
  private currentDataConn: DataConnection | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private localStream: MediaStream | null = null;
  private callbacks: WebRTCCallCallbacks = {};
  private status: CallStatus = "idle";
  private roomCode: string | null = null;
  private isHost: boolean = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: WebRTCCallCallbacks) {
    this.callbacks = callbacks;
  }

  private setStatus(newStatus: CallStatus) {
    this.status = newStatus;
    this.callbacks.onCallStatusChange?.(newStatus);
  }

  /**
   * Monitora ativamente o RTCPeerConnection para lidar com mudanças de ICE e reiniciar conexão se falhar
   */
  private monitorPeerConnection(pc?: RTCPeerConnection) {
    if (!pc) return;

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`[WebRTC ICE State]: ${state}`);

      if (state === "connected" || state === "completed") {
        this.setStatus("connected");
        this.callbacks.onStatusDetailChange?.("P2P Conectado");
      } else if (state === "checking") {
        this.callbacks.onStatusDetailChange?.("Negociando conexão P2P...");
      } else if (state === "failed") {
        console.warn("[WebRTC ICE State] Falha na negociação direta. Tentando reconexão via TURN relay...");
        this.callbacks.onStatusDetailChange?.("Conectando via retransmissão...");
        try {
          if (typeof (pc as any).restartIce === "function") {
            (pc as any).restartIce();
          }
        } catch (e) {
          console.warn("Erro ao tentar reiniciar ICE:", e);
        }
      } else if (state === "disconnected") {
        this.callbacks.onStatusDetailChange?.("Conexão instável, reconectando...");
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC Connection State]: ${state}`);
      if (state === "connected") {
        this.setStatus("connected");
        this.callbacks.onStatusDetailChange?.("P2P Conectado");
      } else if (state === "failed") {
        this.setStatus("error");
        this.callbacks.onError?.("A conexão com o participante foi encerrada.");
      }
    };
  }

  /**
   * Inicializa o anfitrião (cria a sala e aguarda a chamada do interlocutor)
   */
  async startHost(roomCode: string, stream: MediaStream): Promise<void> {
    this.disconnect();
    this.roomCode = normalizeRoomCode(roomCode);
    this.localStream = stream;
    this.isHost = true;
    this.setStatus("connecting");
    this.callbacks.onStatusDetailChange?.("Iniciando sala...");

    const hostPeerId = `handspeak-room-${this.roomCode.toLowerCase()}`;

    // Configura canal local para sincronização instantânea em abas do mesmo navegador
    this.setupBroadcastChannel(this.roomCode);

    try {
      const { default: Peer } = await import("peerjs");

      this.peer = new Peer(hostPeerId, {
        debug: 1,
        pingInterval: 5000,
        config: PEER_ICE_CONFIG,
      });

      this.peer.on("open", () => {
        // Sala aberta e aguardando conexão remota
        this.callbacks.onStatusDetailChange?.("Aguardando interlocutor...");
      });

      // Recebe a chamada de vídeo do participante
      this.peer.on("call", (incomingCall: MediaConnection) => {
        this.currentCall = incomingCall;
        this.callbacks.onStatusDetailChange?.("Conectando vídeo...");
        incomingCall.answer(this.localStream!);

        this.monitorPeerConnection(incomingCall.peerConnection);

        incomingCall.on("stream", (remoteStream: MediaStream) => {
          this.setStatus("connected");
          this.callbacks.onStatusDetailChange?.("P2P Conectado");
          this.callbacks.onRemoteStream?.(remoteStream);
        });

        incomingCall.on("close", () => {
          this.setStatus("disconnected");
          this.callbacks.onStatusDetailChange?.("Chamada finalizada");
        });

        incomingCall.on("error", (err: any) => {
          console.error("Erro na chamada WebRTC:", err);
          this.callbacks.onError?.("Falha na chamada de vídeo.");
        });
      });

      // Recebe o canal de dados do participante
      this.peer.on("connection", (dataConn: DataConnection) => {
        this.setupDataConnection(dataConn);
      });

      this.peer.on("error", (err: any) => {
        console.error("Erro no Peer anfitrião:", err);
        if (err.type === "unavailable-id") {
          this.callbacks.onError?.("Código de sala já está em uso por outra sessão ativa. Tente gerar um novo.");
        } else {
          this.callbacks.onError?.(err.message || "Erro ao conectar com o serviço P2P.");
        }
        this.setStatus("error");
      });
    } catch (err: any) {
      console.error("Falha ao inicializar PeerJS:", err);
      this.setStatus("error");
      this.callbacks.onError?.("Não foi possível carregar o motor de conexão P2P.");
    }
  }

  /**
   * Conecta a uma sala existente como participante com retentativas automáticas
   */
  async joinRoom(roomCode: string, stream: MediaStream): Promise<void> {
    this.disconnect();
    this.roomCode = normalizeRoomCode(roomCode);
    this.localStream = stream;
    this.isHost = false;
    this.setStatus("connecting");
    this.callbacks.onStatusDetailChange?.("Conectando ao servidor...");

    const hostPeerId = `handspeak-room-${this.roomCode.toLowerCase()}`;

    // Configura canal local para sincronização em abas locais
    this.setupBroadcastChannel(this.roomCode);

    try {
      const { default: Peer } = await import("peerjs");

      // Cria peer com ID aleatório para o participante
      this.peer = new Peer({
        debug: 1,
        pingInterval: 5000,
        config: PEER_ICE_CONFIG,
      });

      let attemptCount = 0;
      const maxAttempts = 4;
      let hasReceivedStream = false;

      const attemptConnect = () => {
        if (!this.peer || this.peer.destroyed || hasReceivedStream) return;
        attemptCount++;

        this.callbacks.onStatusDetailChange?.(
          attemptCount > 1
            ? `Tentando conectar ao anfitrião (${attemptCount}/${maxAttempts})...`
            : "Conectando à sala..."
        );

        try {
          // Abre canal de dados com o host
          const dataConn = this.peer.connect(hostPeerId, {
            reliable: true,
          });
          this.setupDataConnection(dataConn);

          // Dispara a chamada de vídeo para o host
          const call = this.peer.call(hostPeerId, this.localStream!);
          this.currentCall = call;

          if (call) {
            this.monitorPeerConnection(call.peerConnection);

            call.on("stream", (remoteStream: MediaStream) => {
              hasReceivedStream = true;
              this.setStatus("connected");
              this.callbacks.onStatusDetailChange?.("P2P Conectado");
              this.callbacks.onRemoteStream?.(remoteStream);
            });

            call.on("close", () => {
              this.setStatus("disconnected");
              this.callbacks.onStatusDetailChange?.("Chamada finalizada");
            });

            call.on("error", (err: any) => {
              console.warn(`Tentativa ${attemptCount} de vídeo falhou:`, err);
              if (attemptCount < maxAttempts && !hasReceivedStream) {
                if (this.retryTimer) clearTimeout(this.retryTimer);
                this.retryTimer = setTimeout(attemptConnect, 2000);
              } else {
                this.callbacks.onError?.("Falha ao estabelecer transmissão de vídeo com a sala.");
              }
            });
          }
        } catch (err: any) {
          console.warn(`Erro ao disparar chamada (tentativa ${attemptCount}):`, err);
          if (attemptCount < maxAttempts && !hasReceivedStream) {
            if (this.retryTimer) clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(attemptConnect, 2000);
          }
        }
      };

      this.peer.on("open", () => {
        attemptConnect();
      });

      this.peer.on("error", (err: any) => {
        console.warn("Aviso no Peer participante:", err?.type, err?.message);
        if (err.type === "peer-unavailable") {
          if (attemptCount < maxAttempts && !hasReceivedStream) {
            this.callbacks.onStatusDetailChange?.(
              `Aguardando anfitrião abrir a sala (${attemptCount}/${maxAttempts})...`
            );
            if (this.retryTimer) clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(attemptConnect, 2000);
            return;
          }
          this.callbacks.onError?.("Sala não encontrada ou o anfitrião ainda não abriu a sala. Verifique o código.");
          this.setStatus("error");
          return;
        }

        this.callbacks.onError?.(err.message || "Erro ao conectar com a sala.");
        this.setStatus("error");
      });
    } catch (err: any) {
      console.error("Falha ao inicializar PeerJS:", err);
      this.setStatus("error");
      this.callbacks.onError?.("Não foi possível carregar o motor de conexão P2P.");
    }
  }

  /**
   * Configura eventos do DataChannel P2P
   */
  private setupDataConnection(conn: DataConnection) {
    this.currentDataConn = conn;

    conn.on("open", () => {
      // Data channel pronto
    });

    conn.on("data", (data: any) => {
      if (data && typeof data === "object") {
        this.callbacks.onDataMessage?.(data as P2PPayload);
      }
    });

    conn.on("close", () => {
      this.currentDataConn = null;
    });

    conn.on("error", (err) => {
      console.warn("Erro no DataChannel:", err);
    });
  }

  /**
   * Configura BroadcastChannel para contingência e sincronização local
   */
  private setupBroadcastChannel(roomCode: string) {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    try {
      this.broadcastChannel = new BroadcastChannel(`handspeak_channel_${roomCode.toLowerCase()}`);
      this.broadcastChannel.onmessage = (event) => {
        const payload = event.data;
        if (payload && typeof payload === "object") {
          this.callbacks.onDataMessage?.(payload as P2PPayload);
        }
      };
    } catch {
      // Ignora falha de canal local
    }
  }

  /**
   * Envia uma mensagem de dados via P2P (legenda, reação ou chat)
   */
  sendPayload(payload: P2PPayload) {
    // 1. Envia via WebRTC DataChannel
    if (this.currentDataConn && this.currentDataConn.open) {
      try {
        this.currentDataConn.send(payload);
      } catch (err) {
        console.warn("Falha ao enviar dados via DataChannel:", err);
      }
    }

    // 2. Envia via BroadcastChannel local (garante entrega em testes na mesma máquina)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
      } catch {
        // Ignora
      }
    }
  }

  /**
   * Encerra a chamada e limpa todas as conexões
   */
  disconnect() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.currentCall) {
      try {
        this.currentCall.close();
      } catch {}
      this.currentCall = null;
    }

    if (this.currentDataConn) {
      try {
        this.currentDataConn.close();
      } catch {}
      this.currentDataConn = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }

    this.localStream = null;
    this.roomCode = null;
    this.isHost = false;
    this.setStatus("disconnected");
  }

  getStatus(): CallStatus {
    return this.status;
  }

  getRoomCode(): string | null {
    return this.roomCode;
  }
}
