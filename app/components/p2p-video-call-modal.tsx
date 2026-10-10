import { useState, useEffect, useRef } from "react";
import {
  type ComprehensionReactionType,
  COMPREHENSION_REACTIONS,
  type P2PPayload,
  type CallStatus,
  WebRTCCallService,
} from "./webrtc-call-service";
import { VideoSafetyGuard, type VideoSafetyViolation } from "./video-safety-guard";
import {
  PhoneOff,
  Video,
  VideoOff,
  Copy,
  Check,
  Send,
  Sparkles,
  Users,
  ShieldAlert,
} from "lucide-react";

interface P2PVideoCallModalProps {
  isOpen: boolean;
  roomCode: string;
  isHost: boolean;
  localStream: MediaStream | null;
  currentLocalTranscript?: string;
  onClose: () => void;
  onSendTranscript?: (text: string) => void;
}

interface IncomingReaction {
  id: string;
  emoji: string;
  text: string;
  sender: "local" | "remote";
}

export function P2PVideoCallModal({
  isOpen,
  roomCode,
  isHost,
  localStream,
  currentLocalTranscript = "",
  onClose,
  onSendTranscript,
}: P2PVideoCallModalProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Estados de Moderação e Segurança de Vídeo
  const [safetyViolation, setSafetyViolation] = useState<VideoSafetyViolation | null>(null);
  const safetyGuardRef = useRef<VideoSafetyGuard | null>(null);

  // Estados de Legendas Flutuantes e Chat
  const [activeSubtitle, setActiveSubtitle] = useState<{
    text: string;
    sender: "signer" | "listener";
  } | null>(null);
  const [inputText, setInputText] = useState("");
  const [recentReactions, setRecentReactions] = useState<IncomingReaction[]>([]);

  // Controles de Hardware Local
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Refs de Mídia
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callServiceRef = useRef<WebRTCCallService | null>(null);
  const subtitleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTriggerSafetyBlock = (violation: VideoSafetyViolation) => {
    setSafetyViolation(violation);

    // 1. Oculta e para imediatamente o vídeo remoto
    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
      remoteVideoRef.current.srcObject = null;
    }

    // 2. Interrompe a guarda de inspeção
    if (safetyGuardRef.current) {
      safetyGuardRef.current.stop();
      safetyGuardRef.current = null;
    }

    // 3. Corta imediatamente a chamada WebRTC P2P
    if (callServiceRef.current) {
      callServiceRef.current.disconnect();
    }

    // 4. Vibração de alerta de emergência
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  };

  // Inicializa o serviço WebRTC P2P
  useEffect(() => {
    if (!isOpen || !roomCode || !localStream) return;

    setErrorMessage(null);
    setSafetyViolation(null);
    setCallStatus("connecting");
    setRemoteStream(null);

    const service = new WebRTCCallService({
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      onDataMessage: (payload: P2PPayload) => {
        handleIncomingData(payload);
      },
      onCallStatusChange: (status) => {
        setCallStatus(status);
      },
      onError: (msg) => {
        setErrorMessage(msg);
      },
    });

    callServiceRef.current = service;

    if (isHost) {
      service.startHost(roomCode, localStream);
    } else {
      service.joinRoom(roomCode, localStream);
    }

    // Configura o vídeo local
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }

    return () => {
      if (safetyGuardRef.current) {
        safetyGuardRef.current.stop();
        safetyGuardRef.current = null;
      }
      service.disconnect();
      callServiceRef.current = null;
    };
  }, [isOpen, roomCode, isHost, localStream]);

  // Atualiza stream remoto no vídeo e conecta o VideoSafetyGuard
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && !safetyViolation) {
      remoteVideoRef.current.srcObject = remoteStream;

      // Inicia o guarda de segurança e moderação em tempo real
      const guard = new VideoSafetyGuard((violation) => {
        handleTriggerSafetyBlock(violation);
      });
      safetyGuardRef.current = guard;
      guard.start(remoteVideoRef.current);

      return () => {
        guard.stop();
        safetyGuardRef.current = null;
      };
    }
  }, [remoteStream, safetyViolation]);

  // Atualiza stream local no elemento
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Sincroniza a transcrição de Libras local como legenda flutuante remota em tempo real
  useEffect(() => {
    if (!currentLocalTranscript.trim() || !callServiceRef.current) return;

    const trimmed = currentLocalTranscript.trim();
    // Exibe localmente
    displaySubtitle(trimmed, "signer");

    // Envia remotamente via P2P
    callServiceRef.current.sendPayload({
      type: "transcript",
      text: trimmed,
      sender: "signer",
    });
  }, [currentLocalTranscript]);

  const displaySubtitle = (text: string, sender: "signer" | "listener") => {
    setActiveSubtitle({ text, sender });
    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    subtitleTimeoutRef.current = setTimeout(() => {
      setActiveSubtitle(null);
    }, 7000);
  };

  const handleIncomingData = (payload: P2PPayload) => {
    if (payload.type === "transcript" || payload.type === "chat") {
      displaySubtitle(payload.text, payload.sender);
    } else if (payload.type === "reaction") {
      const meta = COMPREHENSION_REACTIONS.find((r) => r.id === payload.reaction);
      if (meta) {
        triggerReactionBadge(meta.emoji, meta.shortText, "remote");
      }
    }
  };

  const triggerReactionBadge = (emoji: string, text: string, sender: "local" | "remote") => {
    const reactionObj: IncomingReaction = {
      id: `${Date.now()}-${Math.random()}`,
      emoji,
      text,
      sender,
    };

    setRecentReactions((prev) => [...prev.slice(-3), reactionObj]);

    if (navigator.vibrate) {
      navigator.vibrate(sender === "remote" ? [50, 50, 50] : 40);
    }

    setTimeout(() => {
      setRecentReactions((prev) => prev.filter((r) => r.id !== reactionObj.id));
    }, 3500);
  };

  const handleSendReaction = (reactionType: ComprehensionReactionType) => {
    const meta = COMPREHENSION_REACTIONS.find((r) => r.id === reactionType);
    if (!meta) return;

    triggerReactionBadge(meta.emoji, meta.shortText, "local");

    if (callServiceRef.current) {
      callServiceRef.current.sendPayload({
        type: "reaction",
        reaction: reactionType,
      });
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText("");

    // Exibe legenda local e remota
    displaySubtitle(text, "listener");

    if (callServiceRef.current) {
      callServiceRef.current.sendPayload({
        type: "chat",
        text,
        sender: "listener",
      });
    }

    onSendTranscript?.(text);
  };

  const toggleVideoMute = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
      }
    }
  };

  const copyShareLink = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", roomCode);
    navigator.clipboard.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleEndCall = () => {
    if (callServiceRef.current) {
      callServiceRef.current.disconnect();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white animate-fade-in select-none">
      {/* --- BARRA SUPERIOR DA CHAMADA --- */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-mono font-bold tracking-wider">{roomCode}</span>
          </div>
          <span className="text-[11px] font-semibold text-gray-300 hidden sm:inline">
            {callStatus === "connected" ? "P2P Conectado" : "Aguardando interlocutor..."}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Emergência / Denúncia */}
          <button
            onClick={() => {
              handleTriggerSafetyBlock({
                category: "violence",
                confidence: 1.0,
                reason: "Chamada encerrada e reportada manualmente pelo usuário.",
              });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-300 font-bold text-xs rounded-full shadow transition cursor-pointer"
            title="Encerrar chamada imediatamente e denunciar conteúdo"
            aria-label="Encerrar chamada imediatamente e denunciar conteúdo"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Denunciar / Sair</span>
          </button>

          {/* Botão Copiar Link */}
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold border border-white/15 transition cursor-pointer"
            title="Copiar link da chamada"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "Link Copiado!" : "Compartilhar Link"}</span>
          </button>

          {/* Botão Encerrar */}
          <button
            onClick={handleEndCall}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-full shadow-lg transition cursor-pointer"
            aria-label="Encerrar chamada"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Encerrar</span>
          </button>
        </div>
      </header>

      {/* --- ÁREA PRINCIPAL DE VÍDEO (VIEWPORT) --- */}
      <main className="relative flex-1 w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {/* ESCUDO DE SEGURANÇA E BLOQUEIO IMEDIATO */}
        {safetyViolation && (
          <div className="absolute inset-0 z-50 bg-red-950/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-red-600/30 border-2 border-red-500 flex items-center justify-center text-red-400 mb-4 shadow-2xl">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
              Chamada Encerrada por Violação de Segurança
            </h2>
            <p className="text-xs sm:text-sm text-red-200 max-w-md mb-6 leading-relaxed">
              O sistema de proteção em tempo real identificou conteúdo em desacordo com as diretrizes de integridade (
              {safetyViolation.category === "sexual"
                ? "conteúdo explícito ou nudez"
                : safetyViolation.category === "violence"
                ? "violência física ou brutalidade"
                : safetyViolation.category === "weapons"
                ? "ameaça ou presença de armas"
                : safetyViolation.category === "child_safety"
                ? "segurança e proteção de menores"
                : "conteúdo impróprio"}
              ). A transmissão de vídeo e a chamada P2P foram cortadas imediatamente.
            </p>
            <button
              onClick={handleEndCall}
              className="px-6 py-3 bg-white hover:bg-gray-100 text-red-950 font-black text-xs rounded-2xl shadow-xl transition cursor-pointer"
            >
              Sair da Chamada
            </button>
          </div>
        )}

        {/* VÍDEO REMOTO */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover sm:object-contain transition duration-200 ${
              safetyViolation ? "filter blur-3xl opacity-0 pointer-events-none" : ""
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-teal-500/20 border-2 border-teal-500/40 flex items-center justify-center text-teal-400 text-3xl mb-4 animate-pulse">
              <Users className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              Aguardando o interlocutor entrar...
            </h3>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              Compartilhe o link da chamada com a outra pessoa. Quando ela abrir, o vídeo e a tradução iniciarão automaticamente.
            </p>
            <button
              onClick={copyShareLink}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold text-xs rounded-2xl shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              <span>Copiar Link da Sala ({roomCode})</span>
            </button>
            {errorMessage && (
              <p className="mt-4 text-xs text-red-400 bg-red-950/60 p-2.5 rounded-xl border border-red-800/60">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* MINIATURA LOCAL (PICTURE-IN-PICTURE) */}
        <div className="absolute top-20 right-4 w-28 sm:w-44 aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoMuted ? "hidden" : ""}`}
            style={{ transform: "scaleX(-1)" }}
          />
          {isVideoMuted && (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-xs">
              <VideoOff className="w-6 h-6 mb-1" />
              <span>Câmera pausada</span>
            </div>
          )}
          <div className="absolute bottom-1 left-2 text-[10px] font-bold text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
            Você
          </div>
        </div>

        {/* TOASTS DE REAÇÕES DE COMPREENSÃO FLUTUANTES */}
        <div className="absolute top-24 left-6 z-30 flex flex-col gap-2 pointer-events-none">
          {recentReactions.map((reaction) => (
            <div
              key={reaction.id}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl backdrop-blur-md shadow-xl border text-xs font-extrabold animate-bounce ${
                reaction.sender === "local"
                  ? "bg-teal-600/90 text-white border-teal-400/50"
                  : "bg-amber-500/90 text-gray-950 border-amber-300"
              }`}
            >
              <span className="text-xl">{reaction.emoji}</span>
              <span>{reaction.text}</span>
            </div>
          ))}
        </div>

        {/* BANNER DE LEGENDAS FLUTUANTES DINÂMICAS */}
        {activeSubtitle && (
          <div className="absolute bottom-28 inset-x-4 sm:inset-x-12 z-30 flex justify-center pointer-events-none animate-fade-in">
            <div className="max-w-3xl w-full bg-black/85 backdrop-blur-md border border-white/25 rounded-3xl p-4 sm:p-5 shadow-2xl text-center">
              <div className="text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
                <span>{activeSubtitle.sender === "signer" ? "🤟 Libras Traduzido:" : "✍️ Interlocutor:"}</span>
              </div>
              <p className="text-xl sm:text-3xl font-black text-white tracking-wide leading-snug drop-shadow-md">
                {activeSubtitle.text}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* --- BARRA INFERIOR: REAÇÕES RÁPIDAS & DOCK DE CONVERSAÇÃO --- */}
      <footer className="relative z-20 w-full p-4 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col gap-3">
        {/* BARRA DE REAÇÕES RÁPIDAS DE COMPREENSÃO */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto py-1 scrollbar-none">
          {COMPREHENSION_REACTIONS.map((rec) => (
            <button
              key={rec.id}
              onClick={() => handleSendReaction(rec.id)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/25 active:scale-95 backdrop-blur-md border border-white/15 rounded-full text-xs font-bold text-white transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
              title={rec.label}
            >
              <span className="text-base">{rec.emoji}</span>
              <span className="hidden sm:inline">{rec.shortText}</span>
            </button>
          ))}
        </div>

        {/* DOCK DE DIGITAÇÃO DE RESPOSTA & CONTROLES DE CÂMERA */}
        <div className="max-w-2xl w-full mx-auto flex items-center gap-2">
          {/* Alternar Câmera */}
          <button
            onClick={toggleVideoMute}
            className={`p-3 rounded-2xl backdrop-blur-md border transition cursor-pointer shrink-0 ${
              isVideoMuted
                ? "bg-amber-600/80 border-amber-500 text-white"
                : "bg-white/10 hover:bg-white/20 border-white/15 text-white"
            }`}
            title={isVideoMuted ? "Ativar câmera" : "Pausar câmera"}
            aria-label={isVideoMuted ? "Ativar câmera" : "Pausar câmera"}
          >
            {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Campo de Digitação Rápida */}
          <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite uma mensagem para aparecer na legenda..."
              className="flex-1 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-40 text-white rounded-2xl shadow-lg transition cursor-pointer shrink-0"
              title="Enviar para legenda"
              aria-label="Enviar para legenda"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
