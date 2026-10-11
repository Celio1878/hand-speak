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
  isProUser,
  getRemainingVideoSeconds,
  consumeVideoSeconds,
} from "./freemium-service";
import {
  PhoneOff,
  Video,
  VideoOff,
  Copy,
  Check,
  Send,
  Users,
  ShieldAlert,
  Play,
  Clock,
  Sparkles,
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
  const [statusDetail, setStatusDetail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);

  // Estados de Moderação e Segurança de Vídeo (Local e Remoto)
  const [safetyViolation, setSafetyViolation] = useState<VideoSafetyViolation | null>(null);
  const localSafetyGuardRef = useRef<VideoSafetyGuard | null>(null);
  const remoteSafetyGuardRef = useRef<VideoSafetyGuard | null>(null);

  // Cota Diária de Vídeo para Usuários Free (5 minutos = 300 segundos)
  const isPro = isProUser();
  const [remainingSeconds, setRemainingSeconds] = useState<number>(getRemainingVideoSeconds());
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

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

  const handleTriggerSafetyBlock = (
    violation: VideoSafetyViolation,
    source: "local" | "remote" = "local"
  ) => {
    setSafetyViolation(violation);

    // 1. Notifica o interlocutor via P2P se a violação foi originada localmente
    if (source === "local" && callServiceRef.current) {
      try {
        callServiceRef.current.sendPayload({
          type: "safety_violation",
          category: violation.category,
          reason: violation.reason,
        });
      } catch {}
    }

    // 2. Desliga imediatamente os tracks de hardware da câmera local
    if (localStream) {
      try {
        localStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch {}
    }
    localSafetyGuardRef.current?.stopHardware();

    // 3. Oculta e para imediatamente o vídeo remoto
    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
      remoteVideoRef.current.srcObject = null;
    }

    // 4. Interrompe as guardas de inspeção local e remota
    if (localSafetyGuardRef.current) {
      localSafetyGuardRef.current.stop();
      localSafetyGuardRef.current = null;
    }
    if (remoteSafetyGuardRef.current) {
      remoteSafetyGuardRef.current.stop();
      remoteSafetyGuardRef.current = null;
    }

    // 5. Corta imediatamente a chamada WebRTC P2P
    if (callServiceRef.current) {
      callServiceRef.current.disconnect();
    }

    // 6. Vibração de alerta de emergência
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  };

  // Monitor de Cota de Vídeo Free (5 minutos por dia)
  useEffect(() => {
    if (!isOpen || callStatus !== "connected" || isPro || safetyViolation || isQuotaExceeded) return;

    const timer = setInterval(() => {
      const left = getRemainingVideoSeconds();
      if (left <= 0) {
        setIsQuotaExceeded(true);
        try {
          callServiceRef.current?.sendPayload({ type: "quota_exceeded" });
        } catch {}
        if (callServiceRef.current) callServiceRef.current.disconnect();
        clearInterval(timer);
      } else {
        consumeVideoSeconds(1);
        setRemainingSeconds((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, callStatus, isPro, safetyViolation, isQuotaExceeded]);

  // Inicializa o serviço WebRTC P2P
  useEffect(() => {
    if (!isOpen || !roomCode || !localStream) return;

    setErrorMessage(null);
    setSafetyViolation(null);
    setIsQuotaExceeded(false);
    setCallStatus("connecting");
    setStatusDetail(isHost ? "Iniciando sala..." : "Conectando à sala...");
    setRemoteStream(null);
    setIsAutoplayBlocked(false);

    const service = new WebRTCCallService({
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch((err) => {
            console.warn("Autoplay inicial bloqueado pelo navegador mobile:", err);
            setIsAutoplayBlocked(true);
          });
        }
      },
      onDataMessage: (payload: P2PPayload) => {
        handleIncomingData(payload);
      },
      onCallStatusChange: (status) => {
        setCallStatus(status);
      },
      onStatusDetailChange: (detail) => {
        setStatusDetail(detail);
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

    return () => {
      if (localSafetyGuardRef.current) {
        localSafetyGuardRef.current.stop();
        localSafetyGuardRef.current = null;
      }
      if (remoteSafetyGuardRef.current) {
        remoteSafetyGuardRef.current.stop();
        remoteSafetyGuardRef.current = null;
      }
      service.disconnect();
      callServiceRef.current = null;
    };
  }, [isOpen, roomCode, isHost, localStream]);

  // Atualiza stream local no vídeo e conecta o VideoSafetyGuard local
  useEffect(() => {
    if (localVideoRef.current && localStream && !safetyViolation) {
      localVideoRef.current.srcObject = localStream;

      const guard = new VideoSafetyGuard((violation) => {
        handleTriggerSafetyBlock(violation, "local");
      });
      localSafetyGuardRef.current = guard;
      guard.start(localVideoRef.current, localStream);

      return () => {
        guard.stop();
        localSafetyGuardRef.current = null;
      };
    }
  }, [localStream, safetyViolation]);

  // Atualiza stream remoto no vídeo e conecta o VideoSafetyGuard remoto
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && !safetyViolation) {
      if (remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      remoteVideoRef.current.play().catch((err) => {
        console.warn("Autoplay bloqueado pelo navegador:", err);
        setIsAutoplayBlocked(true);
      });

      // Inicia o guarda de segurança e moderação no vídeo remoto
      const guard = new VideoSafetyGuard((violation) => {
        handleTriggerSafetyBlock(violation, "remote");
      });
      remoteSafetyGuardRef.current = guard;
      guard.start(remoteVideoRef.current, remoteStream);

      return () => {
        guard.stop();
        remoteSafetyGuardRef.current = null;
      };
    }
  }, [remoteStream, safetyViolation]);

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
    } else if (payload.type === "safety_violation") {
      handleTriggerSafetyBlock(
        {
          category: payload.category,
          confidence: 1.0,
          reason: payload.reason || "Chamada encerrada pelo sistema por violação de segurança no vídeo do interlocutor.",
        },
        "remote"
      );
    } else if (payload.type === "quota_exceeded") {
      setIsQuotaExceeded(true);
      if (callServiceRef.current) {
        callServiceRef.current.disconnect();
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

  const handleUnblockAutoplay = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current
        .play()
        .then(() => {
          setIsAutoplayBlocked(false);
        })
        .catch((err) => {
          console.error("Falha ao iniciar vídeo manualmente:", err);
        });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] w-full bg-gray-950 text-white animate-fade-in select-none overflow-hidden">
      {/* --- BARRA SUPERIOR DA CHAMADA (COM SAFE-AREA) --- */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/85 via-black/50 to-transparent">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-full border border-white/10">
            <span
              className={`w-2 h-2 rounded-full ${
                callStatus === "connected"
                  ? "bg-emerald-400"
                  : callStatus === "error"
                  ? "bg-red-400"
                  : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className="text-xs font-mono font-bold tracking-wider">{roomCode}</span>
          </div>

          {/* Badge de status visível em todas as resoluções */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] sm:text-[11px] font-semibold text-gray-300">
            <span className="max-w-[110px] sm:max-w-none truncate">
              {callStatus === "connected"
                ? "P2P Conectado"
                : statusDetail || (callStatus === "connecting" ? "Conectando..." : "Aguardando...")}
            </span>
          </div>

          {/* Badge de cota restante de vídeo para usuários Free (5 min) */}
          {!isPro && callStatus === "connected" && (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono font-bold ${
                remainingSeconds <= 60
                  ? "bg-red-500/20 border-red-500/40 text-red-300 animate-pulse"
                  : "bg-amber-500/20 border-amber-400/40 text-amber-300"
              }`}
              title="Tempo restante de vídeo hoje no plano gratuito"
            >
              <Clock className="w-3 h-3" />
              <span>
                {Math.floor(remainingSeconds / 60)}:{(remainingSeconds % 60).toString().padStart(2, "0")} (Free)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Botão de Emergência / Denúncia */}
          <button
            onClick={() => {
              handleTriggerSafetyBlock({
                category: "violence",
                confidence: 1.0,
                reason: "Chamada encerrada e reportada manualmente pelo usuário.",
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-red-950/80 hover:bg-red-900 border border-red-700/80 text-red-300 font-bold text-xs rounded-full shadow transition cursor-pointer min-h-[40px]"
            title="Encerrar chamada imediatamente e denunciar conteúdo"
            aria-label="Encerrar chamada imediatamente e denunciar conteúdo"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Denunciar / Sair</span>
          </button>

          {/* Botão Copiar Link */}
          <button
            onClick={copyShareLink}
            className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold border border-white/15 transition cursor-pointer min-h-[40px]"
            title="Copiar link da chamada"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copiedLink ? "Link Copiado!" : "Compartilhar Link"}</span>
          </button>

          {/* Botão Encerrar */}
          <button
            onClick={handleEndCall}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-full shadow-lg transition cursor-pointer min-h-[40px]"
            aria-label="Encerrar chamada"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>Sair</span>
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
                ? "conteúdo sexual explícito ou partes íntimas"
                : safetyViolation.category === "drugs"
                ? "drogas ilícitas, entorpecentes ou parafernália"
                : safetyViolation.category === "violence"
                ? "violência física, brutalidade ou sangue"
                : safetyViolation.category === "terror"
                ? "extremismo violento ou ameaça terrorista"
                : safetyViolation.category === "weapons"
                ? "ameaça ou presença de armas"
                : safetyViolation.category === "child_safety"
                ? "segurança e proteção de menores"
                : safetyViolation.category === "alcohol_tobacco"
                ? "consumo ostensivo de bebidas alcoólicas ou tabaco/vapes"
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

        {/* ESCUDO DE COTA DIÁRIA EXCEDIDA (5 MINUTOS NO PLANO FREE) */}
        {isQuotaExceeded && !safetyViolation && (
          <div className="absolute inset-0 z-50 bg-gray-950/95 backdrop-blur-3xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center text-amber-400 mb-4 shadow-2xl animate-pulse">
              <Clock className="w-10 h-10" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
              Cota Diária de Vídeo Atingida (5 min)
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 max-w-md mb-6 leading-relaxed">
              Você utilizou os 5 minutos diários de videochamada gratuitos de hoje. Sua cota será renovada à meia-noite. Assine o Plano Pro (R$ 24,90/mês) para videochamadas ilimitadas.
            </p>
            <button
              onClick={handleEndCall}
              className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 text-white font-extrabold text-xs rounded-2xl shadow-xl transition cursor-pointer"
            >
              Concluir Chamada
            </button>
          </div>
        )}

        {/* VÍDEO REMOTO (SEMPRE MONTADO NO DOM COM MUTED PARA EVITAR BLOQUEIO DE AUTOPLAY NO MOBILE) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover sm:object-contain transition-opacity duration-300 ${
            remoteStream && !safetyViolation ? "opacity-100" : "opacity-0 pointer-events-none absolute inset-0"
          } ${safetyViolation ? "filter blur-3xl" : ""}`}
        />

        {/* BOTÃO DE REPRODUÇÃO MANUAL CASO O NAVEGADOR MÓVEL EXIJA TOQUE */}
        {isAutoplayBlocked && remoteStream && !safetyViolation && (
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <button
              onClick={handleUnblockAutoplay}
              className="px-6 py-3.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-extrabold text-sm rounded-2xl shadow-2xl flex items-center gap-2 cursor-pointer transition active:scale-95"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>Toque para Ativar Vídeo</span>
            </button>
            <p className="text-xs text-gray-300 mt-3 max-w-xs">
              Seu navegador requer um toque na tela para iniciar o vídeo remoto.
            </p>
          </div>
        )}

        {/* TELA DE ESPERA QUANDO SEM STREAM REMOTO */}
        {!remoteStream && !safetyViolation && (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md z-10 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-teal-500/20 border-2 border-teal-500/40 flex items-center justify-center text-teal-400 text-3xl mb-4 animate-pulse">
              <Users className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">
              {isHost ? "Aguardando o interlocutor entrar..." : "Conectando à sala do anfitrião..."}
            </h3>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              {isHost
                ? "Compartilhe o link da chamada com a outra pessoa. Quando ela abrir, o vídeo e a tradução iniciarão automaticamente."
                : `Aguardando estabelecimento da conexão com a sala ${roomCode}. O vídeo e as legendas iniciarão assim que a conexão for concluída.`}
            </p>

            {isHost && (
              <button
                onClick={copyShareLink}
                className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold text-xs rounded-2xl shadow-xl flex items-center gap-2 cursor-pointer active:scale-95 transition"
              >
                <Copy className="w-4 h-4" />
                <span>Copiar Link da Sala ({roomCode})</span>
              </button>
            )}

            {/* Status detalhado durante a espera */}
            {statusDetail && (
              <div className="mt-4 flex items-center gap-2 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/10 text-xs font-mono text-cyan-300 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>{statusDetail}</span>
              </div>
            )}

            {errorMessage && (
              <p className="mt-4 text-xs text-red-400 bg-red-950/60 p-2.5 rounded-xl border border-red-800/60 max-w-sm">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* MINIATURA LOCAL (PICTURE-IN-PICTURE) */}
        <div className="absolute top-16 sm:top-20 right-3 sm:right-4 w-24 sm:w-44 aspect-video bg-gray-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20">
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
              <VideoOff className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Câmera off</span>
            </div>
          )}
          <div className="absolute bottom-1 left-1.5 text-[9px] sm:text-[10px] font-bold text-white/80 bg-black/60 px-1.5 py-0.5 rounded">
            Você
          </div>
        </div>

        {/* TOASTS DE REAÇÕES DE COMPREENSÃO FLUTUANTES */}
        <div className="absolute top-20 sm:top-24 left-3 sm:left-6 z-30 flex flex-col gap-2 pointer-events-none">
          {recentReactions.map((reaction) => (
            <div
              key={reaction.id}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl backdrop-blur-md shadow-xl border text-xs font-extrabold animate-bounce ${
                reaction.sender === "local"
                  ? "bg-teal-600/90 text-white border-teal-400/50"
                  : "bg-amber-500/90 text-gray-950 border-amber-300"
              }`}
            >
              <span className="text-lg sm:text-xl">{reaction.emoji}</span>
              <span>{reaction.text}</span>
            </div>
          ))}
        </div>

        {/* BANNER DE LEGENDAS FLUTUANTES DINÂMICAS */}
        {activeSubtitle && (
          <div className="absolute bottom-28 sm:bottom-32 inset-x-3 sm:inset-x-12 z-30 flex justify-center pointer-events-none animate-fade-in">
            <div className="max-w-3xl w-full bg-black/85 backdrop-blur-md border border-white/25 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-2xl text-center">
              <div className="text-[10px] sm:text-[11px] font-bold text-teal-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
                <span>{activeSubtitle.sender === "signer" ? "🤟 Libras Traduzido:" : "✍️ Interlocutor:"}</span>
              </div>
              <p className="text-base sm:text-3xl font-black text-white tracking-wide leading-snug drop-shadow-md">
                {activeSubtitle.text}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* --- BARRA INFERIOR: REAÇÕES RÁPIDAS & DOCK DE CONVERSAÇÃO (COM SAFE-AREA) --- */}
      <footer className="relative z-20 w-full p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black via-black/95 to-transparent flex flex-col gap-2.5 sm:gap-3">
        {/* BOTÕES DE REAÇÃO RÁPIDA DE COMPREENSÃO MÚTUA */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto py-1 px-2 no-scrollbar">
          {COMPREHENSION_REACTIONS.map((rec) => (
            <button
              key={rec.id}
              onClick={() => handleSendReaction(rec.id)}
              className="px-2.5 sm:px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md rounded-xl sm:rounded-2xl border border-white/15 text-white transition flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer shrink-0 min-h-[38px]"
              title={rec.label}
              aria-label={rec.label}
            >
              <span className="text-lg sm:text-base">{rec.emoji}</span>
              <span className="text-xs">{rec.shortText}</span>
            </button>
          ))}
        </div>

        {/* DOCK DE DIGITAÇÃO DE RESPOSTA & CONTROLES DE CÂMERA */}
        <div className="max-w-2xl w-full mx-auto flex items-center gap-2">
          {/* Alternar Câmera */}
          <button
            onClick={toggleVideoMute}
            className={`p-3 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-2xl backdrop-blur-md border transition cursor-pointer shrink-0 ${
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
              placeholder="Mensagem para aparecer na legenda..."
              className="flex-1 px-4 py-3 min-h-[48px] bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 shadow-inner"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-3 min-h-[48px] min-w-[48px] flex items-center justify-center bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-40 text-white rounded-2xl shadow-lg transition cursor-pointer shrink-0"
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
