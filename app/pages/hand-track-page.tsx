import {
  Component,
  Suspense,
  use,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import {
  analyzeLibrasFrame,
  analyzeMotionGesture,
  type GestureToken,
  type RecognitionMode,
} from "~/components/libras-logic";
import { smoothLandmarks } from "~/components/libras-geometry";
import {
  processTranscription,
  resetTranscriptionEngine,
} from "~/components/transcription-engine";
import {
  getWordSuggestions,
  QUICK_PHRASES,
} from "~/components/portuguese-dictionary";
import {
  refineWithGemini,
  reverseTranslateToLibras,
  sanitizeNaturalPortuguese,
} from "~/components/gemini-service";
import {
  getRemainingCredits,
  getSelectedTone,
  isProUser,
} from "~/components/freemium-service";
import { FreemiumModal } from "~/components/freemium-modal";
import {
  LIBRAS_GUIDE_ITEMS,
  type LibrasGuideItem,
} from "~/components/libras-dictionary-data";
import { AnatomicalAssistantWidget } from "~/components/anatomical-assistant-widget";
import { autoCorrectBufferWord } from "~/components/libras-disambiguation-service";
import { RoomJoinModal } from "~/components/room-join-modal";
import { P2PVideoCallModal } from "~/components/p2p-video-call-modal";
import {
  Camera,
  CameraOff,
  Sun,
  Sparkles,
  Delete,
  Space,
  Trash2,
  Settings,
  MessageSquare,
  BookOpen,
  Check,
  Copy,
  AlertTriangle,
  RotateCcw,
  Send,
  Video,
} from "lucide-react";

// --- Singleton e Carregador Resiliente do HandLandmarker ---
let landmarkerPromise: Promise<HandLandmarker> | null = null;

export function resetHandLandmarker(): void {
  landmarkerPromise = null;
}

async function resolveVisionFileset() {
  // 1. Tenta carregar o WASM localmente da pasta /wasm (offline-first, sem CORS)
  try {
    return await FilesetResolver.forVisionTasks("/wasm");
  } catch (localWasmErr) {
    console.warn("WASM local não disponível em /wasm, usando CDN como fallback:", localWasmErr);
  }

  // 2. Fallback para CDN com a versão exata do pacote instalado (@mediapipe/tasks-vision@0.10.22-rc.20250304)
  return await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
  );
}

function getHandLandmarker(): Promise<HandLandmarker> {
  if (typeof window === "undefined") {
    return new Promise(() => {}); // Retorno seguro no SSR
  }

  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await resolveVisionFileset();

      const localModelPath = "/models/hand_landmarker.task";
      const remoteModelPath =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

      // Estratégia de 4 camadas: Local GPU -> Local CPU -> Remoto GPU -> Remoto CPU
      // Camada 1: Modelo local com aceleração GPU
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: localModelPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
      } catch (gpuErr) {
        console.warn("Falha ao inicializar modelo local na GPU, tentando CPU:", gpuErr);
      }

      // Camada 2: Modelo local com processamento CPU
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: localModelPath,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
      } catch (localCpuErr) {
        console.warn("Falha no modelo local, tentando modelo remoto na GPU:", localCpuErr);
      }

      // Camada 3: Modelo remoto com aceleração GPU
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: remoteModelPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
      } catch (remoteGpuErr) {
        console.warn("Falha no modelo remoto na GPU, tentando modelo remoto na CPU:", remoteGpuErr);
      }

      // Camada 4: Modelo remoto com processamento CPU
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: remoteModelPath,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
    })();
  }
  return landmarkerPromise;
}

// --- Error Boundary Dedicado para a Estação de Visão ---
interface VisionErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface VisionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class VisionErrorBoundary extends Component<VisionErrorBoundaryProps, VisionErrorBoundaryState> {
  constructor(props: VisionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): VisionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("VisionErrorBoundary capturou erro de visão:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/60 rounded-3xl p-6 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Não foi possível iniciar o rastreador de Libras
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              Ocorreu uma falha ao inicializar o motor de visão computacional e rastreamento de Libras. Verifique se o seu navegador suporta aceleração por hardware (WebGL) e se os modelos locais estão ativos.
            </p>
            {this.state.error && (
              <div className="text-[11px] font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl mb-5 text-left break-all max-h-28 overflow-y-auto border border-red-200 dark:border-red-900/40">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={this.handleRetry}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Tentar Novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mensagem no histórico bilingue
type ChatMessage = {
  id: string;
  sender: "signer" | "listener";
  text: string;
  rawGlosses?: string[];
  timestamp: string;
  tone?: string;
};

export function HandTrackPage() {
  const [mounted, setMounted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRetry = () => {
    resetHandLandmarker();
    setRetryKey((k) => k + 1);
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm font-semibold text-gray-500">Iniciando HandSpeak...</p>
      </div>
    );
  }

  return (
    <VisionErrorBoundary key={retryKey} onRetry={handleRetry}>
      <Suspense
        fallback={
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-300">
              Carregando Inteligência de Libras...
            </p>
          </div>
        }
      >
        <ConversationalStation />
      </Suspense>
    </VisionErrorBoundary>
  );
}

function ConversationalStation() {
  const handLandmarker = use(getHandLandmarker());

  // Estados de Câmera e Visão
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [mode, setMode] = useState<RecognitionMode>("WORDS");
  const [activeSign, setActiveSign] = useState<string | null>(null);
  const [lockProgress, setLockProgress] = useState(0);
  const [contrastEnhanced, setContrastEnhanced] = useState(false);
  const [trackingQuality, setTrackingQuality] = useState<"stable" | "adjusting" | "idle">("idle");

  // Estados de Transcrição e Diálogo
  const [transcript, setTranscript] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAiRefining, setIsAiRefining] = useState(false);

  // Estados do Diálogo do Interlocutor (Texto -> Libras)
  const [listenerInputText, setListenerInputText] = useState("");
  const [listenerText, setListenerText] = useState("");
  const [listenerGlosses, setListenerGlosses] = useState<string[]>([]);

  // Linha do Tempo e Histórico
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Aba lateral ativa: "dialogue" ou "assistant"
  const [activeSideTab, setActiveSideTab] = useState<"dialogue" | "assistant">("dialogue");
  const [assistantText, setAssistantText] = useState("");
  const [autoCorrectToast, setAutoCorrectToast] = useState<string | null>(null);

  // Modais
  const [isFreemiumOpen, setIsFreemiumOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideFilter, setGuideFilter] = useState<"todos" | "alfabeto" | "sinais">("todos");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados de Chamada de Vídeo P2P (WebRTC 100% Frontend)
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callRoomCode, setCallRoomCode] = useState("");
  const [isCallHost, setIsCallHost] = useState(false);
  const [callLocalStream, setCallLocalStream] = useState<MediaStream | null>(null);
  const [initialRoomFromUrl, setInitialRoomFromUrl] = useState("");

  // Informações de IA e Cotas
  const [credits, setCredits] = useState(getRemainingCredits());
  const [isPro, setIsPro] = useState(isProUser());
  const [, startTransition] = useTransition();

  // Refs de Mídia
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const historyRef = useRef<NormalizedLandmark[][]>([]);
  const previousLandmarksRef = useRef<NormalizedLandmark[][]>([]);

  useEffect(() => {
    // Detecta parâmetro de sala na URL (?room=HS-XXXX) para entrar automaticamente
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam) {
        setInitialRoomFromUrl(roomParam.toUpperCase());
        setIsRoomModalOpen(true);
      }
    }

    return () => {
      stopCamera();
    };
  }, []);

  const refreshFreemiumStatus = () => {
    setCredits(getRemainingCredits());
    setIsPro(isProUser());
  };

  const handleStartHost = async (roomCode: string) => {
    setIsRoomModalOpen(false);
    let stream = videoRef.current?.srcObject as MediaStream | null;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
            facingMode: "user",
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
          setWebcamRunning(true);
        }
      } catch (err) {
        console.error("Falha ao abrir câmera para chamada:", err);
      }
    }
    setCallLocalStream(stream);
    setCallRoomCode(roomCode);
    setIsCallHost(true);
    setIsCallModalOpen(true);
  };

  const handleJoinRoom = async (roomCode: string) => {
    setIsRoomModalOpen(false);
    let stream = videoRef.current?.srcObject as MediaStream | null;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
            facingMode: "user",
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
          setWebcamRunning(true);
        }
      } catch (err) {
        console.error("Falha ao abrir câmera para chamada:", err);
      }
    }
    setCallLocalStream(stream);
    setCallRoomCode(roomCode);
    setIsCallHost(false);
    setIsCallModalOpen(true);
  };

  function stopCamera() {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    resetTranscriptionEngine();
    setActiveSign(null);
    setLockProgress(0);
    setTrackingQuality("idle");
    previousLandmarksRef.current = [];
  }

  async function toggleWebcam() {
    if (webcamRunning) {
      setWebcamRunning(false);
      stopCamera();
    } else {
      setWebcamRunning(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
            facingMode: "user",
          },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", predictWebcam);
        }
      } catch (err) {
        console.error("Erro ao acessar câmera:", err);
        setWebcamRunning(false);
      }
    }
  }

  function predictWebcam() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.videoWidth > 0 && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const startTime = performance.now();
    const result = handLandmarker.detectForVideo(video, startTime);

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawingUtils = new DrawingUtils(ctx);

      let detectedToken: GestureToken | null = null;

      if (result.landmarks && result.landmarks.length > 0) {
        // Suavização anti-jitter temporal (EMA) para estabilização das falanges
        const smoothedLandmarks = result.landmarks.map((rawHand, idx) => {
          const prev = previousLandmarksRef.current[idx] || null;
          return smoothLandmarks(rawHand, prev, 0.72);
        });
        previousLandmarksRef.current = smoothedLandmarks;

        // Avalia qualidade de rastreamento com base na confiança do MediaPipe
        const primaryScore = result.handedness[0]?.[0]?.score ?? 0;
        if (primaryScore >= 0.75) {
          setTrackingQuality("stable");
        } else {
          setTrackingQuality("adjusting");
        }

        // Desenha até 2 mãos com cores diferenciadas usando os landmarks suavizados
        smoothedLandmarks.forEach((landmarks, idx) => {
          const handedness = result.handedness[idx]?.[0]?.displayName || "Hand";
          const isRight = handedness === "Right";
          const connectorColor = isRight ? "rgba(0, 229, 255, 0.7)" : "rgba(245, 158, 11, 0.7)";
          const landmarkColor = isRight ? "#00e5ff" : "#f59e0b";

          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: connectorColor,
            lineWidth: 3,
          });
          drawingUtils.drawLandmarks(landmarks, {
            color: landmarkColor,
            lineWidth: 1,
            radius: 3,
          });
        });

        // Histórico temporal de movimento da mão primária
        const primaryHand = smoothedLandmarks[0];
        const hist = historyRef.current;
        hist.push(primaryHand);
        if (hist.length > 24) hist.shift();

        // 1. Verifica gestos dinâmicos com movimento (Oi, Z, J)
        const motionToken = analyzeMotionGesture(hist, result.handedness[0]?.[0]);
        if (motionToken) {
          detectedToken = motionToken;
        } else {
          // 2. Analisa sinal estático (2 mãos ou 1 mão) com respeito ao modo atual
          detectedToken = analyzeLibrasFrame(smoothedLandmarks, result.handedness, mode);
        }
      } else {
        previousLandmarksRef.current = [];
        setTrackingQuality("idle");
      }

      // Processa confirmação pelo motor de transcrição
      const {
        currentSign,
        progress,
        confirmedLetter,
        confirmedWord,
        confirmedNumber,
      } = processTranscription(detectedToken);

      setActiveSign(currentSign);
      setLockProgress(progress);

      // Tratamento de confirmações
      if (confirmedLetter) {
        setTranscript((prev) => {
          const next = prev + confirmedLetter;
          updateSuggestions(next);
          return next;
        });
        if (navigator.vibrate) navigator.vibrate(40);
      }

      if (confirmedNumber !== null) {
        setTranscript((prev) => prev + String(confirmedNumber));
        if (navigator.vibrate) navigator.vibrate(40);
      }

      if (confirmedWord) {
        setTranscript((prev) => {
          const needsSpace = prev.length > 0 && !prev.endsWith(" ");
          const next = (needsSpace ? prev + " " : prev) + confirmedWord + " ";
          updateSuggestions(next);
          return next;
        });
        if (navigator.vibrate) navigator.vibrate(80);
      }
    }

    if (video.srcObject) {
      requestRef.current = requestAnimationFrame(predictWebcam);
    }
  }

  function updateSuggestions(currentText: string) {
    const words = currentText.trim().split(" ");
    const lastWord = words[words.length - 1] || "";
    if (lastWord.length >= 2) {
      setSuggestions(getWordSuggestions(lastWord));
    } else {
      setSuggestions([]);
    }
  }

  // Autocorreção Semântica por Inatividade (~1.2s após última soletração)
  useEffect(() => {
    if (!transcript) return;
    const trimmed = transcript.trim();
    if (!trimmed || transcript.endsWith(" ")) return;

    const timer = setTimeout(() => {
      const words = trimmed.split(" ");
      const lastWord = words[words.length - 1] || "";
      if (lastWord.length >= 2) {
        const { correctedWord, wasCorrected } = autoCorrectBufferWord(lastWord);
        if (wasCorrected && correctedWord !== lastWord) {
          words[words.length - 1] = correctedWord;
          setTranscript(words.join(" "));
          setAutoCorrectToast(`✨ Corrigido com IA: ${lastWord} → ${correctedWord}`);
          setTimeout(() => setAutoCorrectToast(null), 3000);
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [transcript]);

  // Ações de Edição do Sinalizador
  const handleSpace = () => {
    setTranscript((t) => {
      const trimmed = t.trim();
      const words = trimmed.split(" ");
      const lastWord = words[words.length - 1] || "";
      if (lastWord.length >= 2) {
        const { correctedWord, wasCorrected } = autoCorrectBufferWord(lastWord);
        if (wasCorrected && correctedWord !== lastWord) {
          words[words.length - 1] = correctedWord;
          setAutoCorrectToast(`✨ Corrigido com IA: ${lastWord} → ${correctedWord}`);
          setTimeout(() => setAutoCorrectToast(null), 3000);
          return words.join(" ") + " ";
        }
      }
      return t + " ";
    });
    setSuggestions([]);
  };

  const handleBackspace = () => {
    setTranscript((t) => {
      const next = t.slice(0, -1);
      updateSuggestions(next);
      return next;
    });
  };

  const handleClear = () => {
    setTranscript("");
    setSuggestions([]);
  };

  const handleApplySuggestion = (word: string) => {
    setTranscript((prev) => {
      const words = prev.trim().split(" ");
      words[words.length - 1] = word;
      return words.join(" ") + " ";
    });
    setSuggestions([]);
  };

  // Refinamento de Frase com IA
  const handleRefineWithGemini = async () => {
    if (!transcript.trim()) return;

    setIsAiRefining(true);
    const res = await refineWithGemini(transcript, {
      onOutOfCredits: () => setIsFreemiumOpen(true),
    });
    setIsAiRefining(false);
    refreshFreemiumStatus();

    if (res.naturalPortuguese) {
      const refined = sanitizeNaturalPortuguese(res.naturalPortuguese);
      setTranscript(refined);

      // Adiciona à linha do tempo da conversa
      const newMsg: ChatMessage = {
        id: String(Date.now()),
        sender: "signer",
        text: refined,
        tone: res.toneUsed,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((m) => [...m, newMsg]);
    }
  };

  // Enviar texto de Libras para a linha do tempo (100% visual)
  const handleSendTranscript = () => {
    if (!transcript.trim()) return;

    const newMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "signer",
      text: transcript.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((m) => [...m, newMsg]);
    setTranscript("");
  };

  // Enviar frase rápida para a linha do tempo
  const handleSendQuickPhrase = (phrase: string) => {
    const newMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "signer",
      text: phrase,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((m) => [...m, newMsg]);
  };

  const handleListenerTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listenerInputText.trim()) return;

    const text = listenerInputText.trim();
    setListenerInputText("");
    setListenerText(text);

    const revRes = await reverseTranslateToLibras(text);
    const glosses = revRes.librasGlosses || text.toUpperCase().split(" ");
    setListenerGlosses(glosses);

    const newMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "listener",
      text,
      rawGlosses: glosses,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((m) => [...m, newMsg]);
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtragem dos itens do guia
  const filteredGuide = LIBRAS_GUIDE_ITEMS.filter((item) => {
    if (guideFilter === "todos") return true;
    return item.category === guideFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col items-center">
      {/* --- BARRA SUPERIOR (HEADER) --- */}
      <header className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-90 dark:bg-opacity-90">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center text-white shadow-md">
              <span className="text-xl">🤟</span>
            </div>
            <div>
              <h1 className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                HandSpeak
              </h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium hidden sm:block">
                Tradutor Bidirecional Libras ⇄ Português
              </p>
            </div>
          </div>

          {/* Controles do Topo */}
          <div className="flex items-center gap-2">
            {/* Botão de Créditos Freemium / Pro */}
            <button
              onClick={() => setIsFreemiumOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition border border-gray-200 dark:border-gray-700"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>{isPro ? "PRO ⚡" : `${credits} IA`}</span>
            </button>

            {/* Chamada de Vídeo P2P */}
            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-sm hover:brightness-110 transition cursor-pointer"
              title="Iniciar ou Entrar em Chamada de Vídeo P2P"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Vídeo Chamada P2P</span>
            </button>

            {/* Assistente Anatômico 3D */}
            <button
              onClick={() => setActiveSideTab((prev) => (prev === "assistant" ? "dialogue" : "assistant"))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                activeSideTab === "assistant"
                  ? "bg-cyan-600 text-white border-cyan-500 shadow-sm"
                  : "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 border-cyan-200 dark:border-cyan-800"
              }`}
            >
              <span>🦾</span>
              <span className="hidden sm:inline">Assistente 3D</span>
            </button>

            {/* Guia de Libras */}
            <button
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 transition border border-teal-200 dark:border-teal-800"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Guia de Libras</span>
            </button>

            {/* Configurações */}
            <button
              onClick={() => setIsFreemiumOpen(true)}
              className="p-2 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Configurações do modelo e áudio"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- ÁREA PRINCIPAL DA ESTAÇÃO --- */}
      <main className="max-w-6xl w-full px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: CÂMERA & SINALIZADOR (7 Colunas) */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* CÂMERA COM SKELETON E RECONHECIMENTO */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-xl border-2 border-gray-200 dark:border-gray-800">
            {!webcamRunning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-20 bg-gray-900/90 p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 mb-4">
                  <Camera className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold mb-1">Câmera de Reconhecimento</h3>
                <p className="text-xs text-gray-300 max-w-sm mb-5">
                  Posicione-se a cerca de 1 metro com boa iluminação. O sistema rastreia até 2 mãos simultaneamente.
                </p>
                <button
                  onClick={toggleWebcam}
                  className="px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold rounded-xl shadow-lg hover:scale-105 transition flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Iniciar Câmera
                </button>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-all duration-300 ${
                contrastEnhanced ? "contrast-125 brightness-110 saturate-110" : ""
              }`}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
            />

            {/* SELETOR DE MODO NA CÂMERA */}
            {webcamRunning && (
              <div className="absolute top-3 left-3 z-30 flex gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setMode("WORDS")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mode === "WORDS" ? "bg-teal-500 text-white shadow" : "text-gray-300 hover:text-white"
                  }`}
                >
                  Expressões
                </button>
                <button
                  onClick={() => setMode("ALPHABET")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mode === "ALPHABET" ? "bg-teal-500 text-white shadow" : "text-gray-300 hover:text-white"
                  }`}
                >
                  Alfabeto A-Z
                </button>
                <button
                  onClick={() => setMode("NUMBERS")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    mode === "NUMBERS" ? "bg-teal-500 text-white shadow" : "text-gray-300 hover:text-white"
                  }`}
                >
                  0-10
                </button>
              </div>
            )}

            {/* CONTROLES DE IMAGEM & FECHAR CÂMERA */}
            {webcamRunning && (
              <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
                <button
                  onClick={() => setContrastEnhanced((v) => !v)}
                  className={`p-2 rounded-xl backdrop-blur-md border transition ${
                    contrastEnhanced
                      ? "bg-amber-500 text-white border-amber-400 shadow-md"
                      : "bg-black/60 text-white/80 hover:text-white border-white/10"
                  }`}
                  title={
                    contrastEnhanced
                      ? "Desativar modo de alto contraste"
                      : "Ativar modo de alto contraste para baixa iluminação"
                  }
                >
                  <Sun className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleWebcam}
                  className="p-2 bg-black/60 backdrop-blur-md text-white/80 hover:text-white rounded-xl border border-white/10 transition"
                  title="Pausar câmera"
                >
                  <CameraOff className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* GUIA VISUAL DE ENQUADRAMENTO DAS MÃOS */}
            {webcamRunning && trackingQuality === "idle" && (
              <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-6">
                <div className="w-[75%] h-[80%] border-2 border-dashed border-teal-400/30 rounded-3xl flex items-end justify-center pb-4 transition-all">
                  <span className="text-[11px] font-medium text-teal-300/80 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-teal-400/20">
                    Posicione as mãos nesta área central
                  </span>
                </div>
              </div>
            )}

            {/* INDICADOR DE QUALIDADE DE RASTREAMENTO */}
            {webcamRunning && (
              <div className="absolute bottom-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white shadow-md">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    trackingQuality === "stable"
                      ? "bg-emerald-400 animate-pulse ring-2 ring-emerald-400/40"
                      : trackingQuality === "adjusting"
                      ? "bg-amber-400"
                      : "bg-gray-400"
                  }`}
                />
                <span>
                  {trackingQuality === "stable"
                    ? "Rastreamento Estável (60 FPS)"
                    : trackingQuality === "adjusting"
                    ? "Ajuste a iluminação/enquadramento"
                    : "Aguardando mãos na câmera..."}
                </span>
              </div>
            )}

            {/* ANEL DE CONFIRMAÇÃO DO SINAL DETECTADO */}
            {webcamRunning && activeSign && (
              <div className="absolute bottom-4 right-4 z-30 flex flex-col items-center">
                <div className="relative flex items-center justify-center w-16 h-16 bg-black/75 backdrop-blur-md rounded-full border border-white/20 shadow-lg">
                  <svg className="absolute w-full h-full transform -rotate-90 p-1">
                    <circle
                      cx="50%"
                      cy="50%"
                      r="26"
                      stroke="white"
                      strokeWidth="3.5"
                      fill="transparent"
                      strokeOpacity="0.2"
                    />
                    <circle
                      cx="50%"
                      cy="50%"
                      r="26"
                      stroke="#00e5ff"
                      strokeWidth="3.5"
                      fill="transparent"
                      strokeDasharray="163"
                      strokeDashoffset={163 - (163 * lockProgress) / 100}
                      className="transition-all duration-75 ease-linear"
                    />
                  </svg>
                  <span className="text-xl font-black text-white">{activeSign}</span>
                </div>
                <span className="text-[10px] text-white/80 font-bold mt-1 uppercase tracking-wider drop-shadow">
                  Sustente
                </span>
              </div>
            )}
          </div>

          {/* PAINEL DE TRANSCRIÇÃO DO SINALIZADOR */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                <span>🤟</span> Sua Mensagem em Libras
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleSpace}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 transition flex items-center gap-1"
                >
                  <Space className="w-3.5 h-3.5" /> Espaço
                </button>
                <button
                  onClick={handleBackspace}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center gap-1"
                >
                  <Delete className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleClear}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg text-gray-400 hover:text-red-500 transition"
                  title="Limpar tudo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* CAMPO DE TEXTO TRANSCRIÇÃO */}
            <div className="min-h-[90px] p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 text-2xl font-mono text-gray-900 dark:text-gray-100 break-words flex items-center relative">
              {transcript ? (
                <span>{transcript}</span>
              ) : (
                <span className="text-gray-400 text-lg font-sans italic">
                  Sinalize para a câmera para começar a escrever...
                </span>
              )}
              <span className="w-2.5 h-7 bg-teal-500 ml-1 animate-pulse rounded-sm"></span>
            </div>

            {/* TOAST SUTIL DE AUTOCORREÇÃO INTELIGENTE */}
            {autoCorrectToast && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-semibold animate-fade-in shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                <span>{autoCorrectToast}</span>
              </div>
            )}

            {/* SUGESTÕES PREDITIVAS */}
            {suggestions.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-gray-400 font-medium shrink-0">Sugestões:</span>
                {suggestions.map((word) => (
                  <button
                    key={word}
                    onClick={() => handleApplySuggestion(word)}
                    className="px-3 py-1 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold rounded-lg hover:bg-teal-100 border border-teal-200 dark:border-teal-800 transition shrink-0"
                  >
                    {word}
                  </button>
                ))}
              </div>
            )}

            {/* AÇÕES DE VOZ E IA */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                {/* Botão Refinar com IA */}
                <button
                  onClick={handleRefineWithGemini}
                  disabled={isAiRefining || !transcript.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-xs font-bold rounded-xl shadow hover:brightness-110 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAiRefining ? "Refinando com IA..." : "Refinar Frase com IA"}
                </button>
              </div>

              {/* Botão Enviar para o Diálogo (Visual) */}
              <button
                onClick={handleSendTranscript}
                disabled={!transcript.trim()}
                className="px-5 py-2 bg-gray-900 dark:bg-teal-500 text-white dark:text-gray-950 text-xs font-extrabold rounded-xl shadow hover:bg-black transition flex items-center gap-2 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                Enviar para a Conversa
              </button>
            </div>
          </div>

          {/* PALETA DE FRASES RÁPIDAS DE EMERGÊNCIA E COTIDIANO */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1.5">
              <span>⚡</span> Frases Rápidas Prontas
            </h4>
            <div className="space-y-3">
              {QUICK_PHRASES.map((cat) => (
                <div key={cat.category}>
                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                    {cat.category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {cat.phrases.map((phrase) => (
                      <button
                        key={phrase}
                        onClick={() => handleSendQuickPhrase(phrase)}
                        className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800/80 hover:bg-teal-50 dark:hover:bg-teal-950/30 text-gray-700 dark:text-gray-200 hover:text-teal-700 rounded-lg border border-gray-200 dark:border-gray-700 transition"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COLUNA DIREITA: DIÁLOGO BILINGUE 100% VISUAL & ASSISTENTE ANATÔMICO 3D (5 Colunas) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* SELETOR DE ABA DA COLUNA DIREITA */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-200/70 dark:bg-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-inner">
            <button
              onClick={() => setActiveSideTab("dialogue")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeSideTab === "dialogue"
                  ? "bg-white dark:bg-gray-900 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Diálogo em Tempo Real</span>
            </button>
            <button
              onClick={() => setActiveSideTab("assistant")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                activeSideTab === "assistant"
                  ? "bg-white dark:bg-gray-900 text-cyan-600 dark:text-cyan-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <span>🦾</span>
              <span>Assistente Anatômico 3D</span>
            </button>
          </div>

          {activeSideTab === "assistant" ? (
            <AnatomicalAssistantWidget
              initialText={assistantText}
              onClose={() => setActiveSideTab("dialogue")}
            />
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-5 flex flex-col flex-1 min-h-[580px]">
              {/* Cabeçalho do Diálogo */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      Diálogo em Tempo Real
                    </h3>
                    <p className="text-[10px] text-gray-400">
                      Libras (Câmera) ⇄ Texto Digitado
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800">
                    100% Visual
                  </span>
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="text-xs text-gray-400 hover:text-red-500 transition p-1"
                      title="Limpar Diálogo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ÁREA DE MENSAGENS (CHAT COM ROLAGEM) */}
              <div className="space-y-3 overflow-y-auto flex-1 min-h-[260px] max-h-[380px] pr-1 py-1">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-12 text-center text-gray-400 dark:text-gray-500">
                    <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center text-2xl mb-2">
                      💬
                    </div>
                    <p className="text-xs font-semibold">Nenhuma mensagem ainda.</p>
                    <p className="text-[11px] mt-0.5">
                      Sinalize em Libras para a câmera ou digite uma resposta abaixo!
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.sender === "signer" ? "items-start" : "items-end"
                      }`}
                    >
                      <div
                        className={`max-w-[90%] p-3.5 rounded-2xl shadow-sm text-sm relative ${
                          msg.sender === "signer"
                            ? "bg-teal-50 dark:bg-teal-950/40 text-gray-900 dark:text-teal-100 border border-teal-200 dark:border-teal-800 rounded-tl-none"
                            : "bg-cyan-600 text-white rounded-tr-none"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1 text-[10px] font-semibold opacity-75">
                          <span>{msg.sender === "signer" ? "🤟 Sinalizador (Libras)" : "✍️ Resposta Digitada"}</span>
                          <span>{msg.timestamp}</span>
                        </div>
                        <p className="font-medium text-base">{msg.text}</p>

                        {msg.rawGlosses && (
                          <div className="mt-2 pt-2 border-t border-white/20 flex flex-wrap gap-1">
                            {msg.rawGlosses.map((g, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  setAssistantText(g);
                                  setActiveSideTab("assistant");
                                }}
                                className="text-[10px] px-1.5 py-0.5 bg-black/20 hover:bg-black/40 rounded font-bold transition flex items-center gap-0.5"
                                title="Ver no Assistente 3D"
                              >
                                <span>{g}</span>
                                <span className="opacity-75">🦾</span>
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setAssistantText(msg.text);
                              setActiveSideTab("assistant");
                            }}
                            className="p-1 hover:opacity-80 transition text-cyan-600 dark:text-cyan-300"
                            title="Demonstrar sinal no Assistente Anatômico 3D"
                            aria-label="Demonstrar sinal no Assistente Anatômico 3D"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => copyToClipboard(msg.id, msg.text)}
                            className="p-1 hover:opacity-80 transition"
                            title="Copiar texto"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* CARDS VISUAIS DE LIBRAS DA ÚLTIMA RESPOSTA DIGITADA */}
              {listenerGlosses.length > 0 && (
                <div className="p-3 my-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🤟</span> Sinais de Libras da Resposta:
                    </p>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      Toque para ver em 3D 🦾
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {listenerGlosses.map((gloss, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setAssistantText(gloss);
                          setActiveSideTab("assistant");
                        }}
                        className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900/80 text-amber-950 dark:text-amber-200 font-black text-xs rounded-lg border border-amber-300 dark:border-amber-700 shadow-sm transition flex items-center gap-1 cursor-pointer"
                        title={`Visualizar anatomia 3D de: ${gloss}`}
                      >
                        <span>{gloss}</span>
                        <span className="text-[10px] opacity-75">🦾</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* DOCK DE DIGITAÇÃO NO RODAPÉ DO CHAT */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                <form onSubmit={handleListenerTextSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={listenerInputText}
                    onChange={(e) => setListenerInputText(e.target.value)}
                    placeholder="Digite sua mensagem para a pessoa surda..."
                    className="flex-1 px-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-900 dark:text-gray-100 placeholder-gray-400 shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!listenerInputText.trim()}
                    className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </form>
                <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
                  <span>Pressione Enter para enviar</span>
                  <span>Gera cards e reprodução 3D de Libras</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* --- MODAL DO GUIA VISUAL DE LIBRAS --- */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-teal-600" /> Guia e Referência de Libras
                </h3>
                <p className="text-xs text-gray-500">
                  Consulte a posição correta das mãos para o alfabeto e sinais frequentes.
                </p>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Filtros */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex gap-2">
              <button
                onClick={() => setGuideFilter("todos")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  guideFilter === "todos" ? "bg-teal-600 text-white" : "bg-gray-100 dark:bg-gray-800"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setGuideFilter("alfabeto")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  guideFilter === "alfabeto" ? "bg-teal-600 text-white" : "bg-gray-100 dark:bg-gray-800"
                }`}
              >
                Alfabeto (A-Z)
              </button>
              <button
                onClick={() => setGuideFilter("sinais")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  guideFilter === "sinais" ? "bg-teal-600 text-white" : "bg-gray-100 dark:bg-gray-800"
                }`}
              >
                Expressões & Palavras
              </button>
            </div>

            {/* Lista dos Sinais */}
            <div className="p-5 overflow-y-auto space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredGuide.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 hover:border-teal-500 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-extrabold text-sm text-teal-700 dark:text-teal-400">
                        {item.title}
                      </h4>
                      {item.twoHands && (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
                          2 Mãos
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mb-1.5">{item.description}</p>
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-[11px] text-gray-500 italic">💡 {item.visualTip}</p>
                      <button
                        onClick={() => {
                          setAssistantText(item.id);
                          setIsGuideOpen(false);
                          setActiveSideTab("assistant");
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 border border-cyan-200 dark:border-cyan-800 transition flex items-center gap-1 shrink-0"
                      >
                        <span>🦾</span>
                        <span>Ver no 3D</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-800 text-right">
              <button
                onClick={() => setIsGuideOpen(false)}
                className="px-5 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs font-bold rounded-xl"
              >
                Fechar Guia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL FREEMIUM & CONFIGURAÇÕES --- */}
      <FreemiumModal
        isOpen={isFreemiumOpen}
        onClose={() => setIsFreemiumOpen(false)}
        onUpdate={refreshFreemiumStatus}
      />

      {/* --- MODAIS DE VÍDEO CHAMADA P2P (WEBRTC 100% FRONTEND) --- */}
      <RoomJoinModal
        isOpen={isRoomModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
        onStartHost={handleStartHost}
        onJoinRoom={handleJoinRoom}
        initialRoomCode={initialRoomFromUrl}
      />

      <P2PVideoCallModal
        isOpen={isCallModalOpen}
        roomCode={callRoomCode}
        isHost={isCallHost}
        localStream={callLocalStream}
        currentLocalTranscript={transcript}
        onClose={() => {
          setIsCallModalOpen(false);
          setCallRoomCode("");
        }}
        onSendTranscript={(text) => {
          const newMsg: ChatMessage = {
            id: String(Date.now()),
            sender: "listener",
            text,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((m) => [...m, newMsg]);
        }}
      />
    </div>
  );
}