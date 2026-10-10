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

  constructor(callbacks: WebRTCCallCallbacks) {
    this.callbacks = callbacks;
  }

  private setStatus(newStatus: CallStatus) {
    this.status = newStatus;
    this.callbacks.onCallStatusChange?.(newStatus);
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

    const hostPeerId = `handspeak-room-${this.roomCode.toLowerCase()}`;

    // Configura canal local para sincronização instantânea em abas do mesmo navegador
    this.setupBroadcastChannel(this.roomCode);

    try {
      const { default: Peer } = await import("peerjs");

      this.peer = new Peer(hostPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      this.peer.on("open", () => {
        // Sala aberta e aguardando conexão remota
      });

      // Recebe a chamada de vídeo do participante
      this.peer.on("call", (incomingCall: MediaConnection) => {
        this.currentCall = incomingCall;
        incomingCall.answer(this.localStream!);

        incomingCall.on("stream", (remoteStream: MediaStream) => {
          this.setStatus("connected");
          this.callbacks.onRemoteStream?.(remoteStream);
        });

        incomingCall.on("close", () => {
          this.setStatus("disconnected");
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
          this.callbacks.onError?.("Código de sala já está em uso por outra sessão. Tente gerar um novo.");
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
   * Conecta a uma sala existente como participante
   */
  async joinRoom(roomCode: string, stream: MediaStream): Promise<void> {
    this.disconnect();
    this.roomCode = normalizeRoomCode(roomCode);
    this.localStream = stream;
    this.isHost = false;
    this.setStatus("connecting");

    const hostPeerId = `handspeak-room-${this.roomCode.toLowerCase()}`;

    // Configura canal local para sincronização em abas locais
    this.setupBroadcastChannel(this.roomCode);

    try {
      const { default: Peer } = await import("peerjs");

      // Cria peer com ID aleatório para o participante
      this.peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      this.peer.on("open", () => {
        // Abre canal de dados com o host
        const dataConn = this.peer.connect(hostPeerId, {
          reliable: true,
        });
        this.setupDataConnection(dataConn);

        // Dispara a chamada de vídeo para o host
        const call = this.peer.call(hostPeerId, this.localStream!);
        this.currentCall = call;

        call.on("stream", (remoteStream: MediaStream) => {
          this.setStatus("connected");
          this.callbacks.onRemoteStream?.(remoteStream);
        });

        call.on("close", () => {
          this.setStatus("disconnected");
        });

        call.on("error", (err: any) => {
          console.error("Erro na chamada remota:", err);
          this.callbacks.onError?.("Falha ao estabelecer transmissão de vídeo com a sala.");
        });
      });

      this.peer.on("error", (err: any) => {
        console.error("Erro no Peer participante:", err);
        if (err.type === "peer-unavailable") {
          this.callbacks.onError?.("Sala não encontrada ou o anfitrião não está ativo.");
        } else {
          this.callbacks.onError?.(err.message || "Erro ao conectar com a sala.");
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
   * Configura eventos do DataChannel P2P
   */
  private setupDataConnection(conn: DataConnection) {
    this.currentDataConn = conn;

    conn.on("open", () => {
      this.setStatus("connected");
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
