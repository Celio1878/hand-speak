import { Suspense, use, useEffect, useRef, useState, useTransition } from "react";
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
import {
  processTranscription,
  resetTranscriptionEngine,
} from "~/components/transcription-engine";
import {
  getWordSuggestions,
  QUICK_PHRASES,
} from "~/components/portuguese-dictionary";
import {
  speakText,
  startSpeechRecognition,
  isSpeechRecognitionSupported,
} from "~/components/speech-service";
import {
  refineWithGemini,
  reverseTranslateToLibras,
} from "~/components/gemini-service";
import {
  getRemainingCredits,
  getSelectedModel,
  getSelectedTone,
  isProUser,
} from "~/components/freemium-service";
import { FreemiumModal } from "~/components/freemium-modal";
import {
  LIBRAS_GUIDE_ITEMS,
  type LibrasGuideItem,
} from "~/components/libras-dictionary-data";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Delete,
  Space,
  Trash2,
  Settings,
  MessageSquare,
  BookOpen,
  Check,
  Copy,
} from "lucide-react";

// --- Singleton de Inicialização do HandLandmarker ---
let landmarkerPromise: Promise<HandLandmarker> | null = null;

function getHandLandmarker(): Promise<HandLandmarker> {
  if (typeof window === "undefined") {
    return new Promise(() => {}); // Retorno seguro no SSR
  }

  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
      );

      // Tenta carregar o modelo local primeiro, com fallback para o Google Storage
      const localModelPath = "/models/hand_landmarker.task";
      const remoteModelPath =
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: localModelPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2, // Suporte a 2 MÃOS
        });
      } catch (localErr) {
        console.warn("Falha no modelo local, usando fallback remoto:", localErr);
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: remoteModelPath,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      }
    })();
  }
  return landmarkerPromise;
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

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm font-semibold text-gray-500">Iniciando HandSpeak...</p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-sm font-semibold text-gray-600 dark:text-gray-300">
            Carregando Inteligência de Libras (MediaPipe & Gemini)...
          </p>
        </div>
      }
    >
      <ConversationalStation />
    </Suspense>
  );
}

function ConversationalStation() {
  const handLandmarker = use(getHandLandmarker());

  // Estados de Câmera e Visão
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [mode, setMode] = useState<RecognitionMode>("WORDS");
  const [activeSign, setActiveSign] = useState<string | null>(null);
  const [lockProgress, setLockProgress] = useState(0);

  // Estados de Transcrição e Diálogo
  const [transcript, setTranscript] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isAiRefining, setIsAiRefining] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);

  // Estados de Escuta do Ouvinte
  const [isListening, setIsListening] = useState(false);
  const [listenerText, setListenerText] = useState("");
  const [listenerGlosses, setListenerGlosses] = useState<string[]>([]);

  // Linha do Tempo e Histórico
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Modais
  const [isFreemiumOpen, setIsFreemiumOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideFilter, setGuideFilter] = useState<"todos" | "alfabeto" | "sinais">("todos");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Informações de IA e Cotas
  const [credits, setCredits] = useState(getRemainingCredits());
  const [isPro, setIsPro] = useState(isProUser());
  const [currentModel, setCurrentModel] = useState(getSelectedModel());
  const [, startTransition] = useTransition();

  // Refs de Mídia
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const historyRef = useRef<NormalizedLandmark[][]>([]);
  const stopListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
      if (stopListeningRef.current) stopListeningRef.current();
    };
  }, []);

  const refreshFreemiumStatus = () => {
    setCredits(getRemainingCredits());
    setIsPro(isProUser());
    setCurrentModel(getSelectedModel());
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
        // Desenha até 2 mãos com cores diferenciadas
        result.landmarks.forEach((landmarks, idx) => {
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
        const primaryHand = result.landmarks[0];
        const hist = historyRef.current;
        hist.push(primaryHand);
        if (hist.length > 24) hist.shift();

        // 1. Verifica gestos dinâmicos com movimento (Oi, Z)
        const motionToken = analyzeMotionGesture(hist, result.handedness[0]?.[0]);
        if (motionToken) {
          detectedToken = motionToken;
        } else {
          // 2. Analisa sinal estático (2 mãos ou 1 mão) com respeito ao modo atual
          detectedToken = analyzeLibrasFrame(result.landmarks, result.handedness, mode);
        }
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
          if (autoSpeak) {
            speakText(confirmedWord);
          }
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

  // Ações de Edição do Sinalizador
  const handleSpace = () => {
    setTranscript((t) => t + " ");
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
    if (autoSpeak) speakText(word);
  };

  // Refinamento de Frase com Google Gemini
  const handleRefineWithGemini = async () => {
    if (!transcript.trim()) return;

    setIsAiRefining(true);
    const res = await refineWithGemini(transcript, {
      onOutOfCredits: () => setIsFreemiumOpen(true),
    });
    setIsAiRefining(false);
    refreshFreemiumStatus();

    if (res.naturalPortuguese) {
      const refined = res.naturalPortuguese;
      setTranscript(refined);
      if (autoSpeak) speakText(refined);

      // Adiciona à linha do tempo
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

  // Enviar fala para a linha do tempo e reproduzir áudio
  const handleSpeakAndSend = () => {
    if (!transcript.trim()) return;
    speakText(transcript);

    const newMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "signer",
      text: transcript.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((m) => [...m, newMsg]);
    setTranscript("");
  };

  // Enviar frase rápida
  const handleSendQuickPhrase = (phrase: string) => {
    speakText(phrase);
    const newMsg: ChatMessage = {
      id: String(Date.now()),
      sender: "signer",
      text: phrase,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((m) => [...m, newMsg]);
  };

  // Escuta do Ouvinte (STT)
  const toggleListening = () => {
    if (isListening) {
      if (stopListeningRef.current) stopListeningRef.current();
      setIsListening(false);
    } else {
      setIsListening(true);
      const stopFn = startSpeechRecognition(
        async (recognizedText, isFinal) => {
          setListenerText(recognizedText);
          if (isFinal) {
            // Tradução reversa para Libras
            const revRes = await reverseTranslateToLibras(recognizedText);
            const glosses = revRes.librasGlosses || recognizedText.toUpperCase().split(" ");
            setListenerGlosses(glosses);

            const newMsg: ChatMessage = {
              id: String(Date.now()),
              sender: "listener",
              text: recognizedText,
              rawGlosses: glosses,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            };
            setMessages((m) => [...m, newMsg]);
          }
        },
        (error) => {
          console.error("Erro STT:", error);
          setIsListening(false);
        }
      );
      stopListeningRef.current = stopFn;
    }
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
              className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
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

            {/* BOTÃO DE FECHAR CÂMERA */}
            {webcamRunning && (
              <button
                onClick={toggleWebcam}
                className="absolute top-3 right-3 z-30 p-2 bg-black/60 backdrop-blur-md text-white/80 hover:text-white rounded-xl border border-white/10 transition"
                title="Pausar câmera"
              >
                <CameraOff className="w-4 h-4" />
              </button>
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
                {/* Botão Refinar com Gemini */}
                <button
                  onClick={handleRefineWithGemini}
                  disabled={isAiRefining || !transcript.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-xs font-bold rounded-xl shadow hover:brightness-110 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAiRefining ? "Refinando com IA..." : `Refinar com ${currentModel}`}
                </button>

                {/* Auto Falar Toggle */}
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span>Falar automático</span>
                </label>
              </div>

              {/* Botão Falar em Voz Alta */}
              <button
                onClick={handleSpeakAndSend}
                disabled={!transcript.trim()}
                className="px-5 py-2 bg-gray-900 dark:bg-teal-500 text-white dark:text-gray-950 text-xs font-extrabold rounded-xl shadow hover:bg-black transition flex items-center gap-2 disabled:opacity-40"
              >
                <Volume2 className="w-4 h-4" />
                Falar em Voz Alta
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

        {/* COLUNA DIREITA: OUVIINTE & DIÁLOGO BILINGUE (5 Colunas) */}
        <section className="lg:col-span-5 flex flex-col gap-5">
          {/* PAINEL DO OUVINTE (FALA COM MICROFONE) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <span>🗣️</span> Resposta do Ouvinte
              </span>
              <span className="text-[10px] text-gray-400">Microfone em Português</span>
            </div>

            {/* BOTÃO GRANDE DE GRAVAÇÃO */}
            <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800/40 dark:to-gray-800/80 rounded-2xl border border-gray-200 dark:border-gray-700 text-center">
              <button
                onClick={toggleListening}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all ${
                  isListening
                    ? "bg-red-500 scale-110 animate-pulse ring-4 ring-red-300 dark:ring-red-900"
                    : "bg-gradient-to-tr from-cyan-600 to-teal-500 hover:scale-105"
                }`}
                aria-label={isListening ? "Parar de ouvir" : "Iniciar escuta do ouvinte"}
              >
                {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
              <p className="mt-3 text-sm font-bold text-gray-800 dark:text-gray-200">
                {isListening ? "Ouvindo... Fale agora!" : "Toque no microfone para falar"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                A fala do ouvinte será transcrita em texto e cards de Libras
              </p>
            </div>

            {/* ÚLTIMA FALA CAPTURADA */}
            {listenerText && (
              <div className="p-4 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800">
                <p className="text-xs text-cyan-700 dark:text-cyan-300 font-bold uppercase tracking-wider mb-1">
                  Texto Falado Capturado:
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{listenerText}</p>
              </div>
            )}

            {/* TRADUÇÃO REVERSA EM GLOSSAS DE LIBRAS */}
            {listenerGlosses.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Tradução em Sinais de Libras:
                </p>
                <div className="flex flex-wrap gap-2">
                  {listenerGlosses.map((gloss, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-black text-xs rounded-lg border border-amber-300 dark:border-amber-700 shadow-sm"
                    >
                      {gloss}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* HISTÓRICO DA CONVERSA (CHAT BILINGUE) */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-md border border-gray-200 dark:border-gray-800 p-5 flex flex-col flex-1">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800 mb-3">
              <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-600" /> Diálogo da Conversa
              </h3>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-gray-400 hover:text-red-500 transition"
                >
                  Limpar Diálogo
                </button>
              )}
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[380px] pr-1">
              {messages.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs italic">
                  Nenhuma mensagem ainda. Inicie a conversa por Libras ou pelo microfone!
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
                        <span>{msg.sender === "signer" ? "🤟 Sinalizador (Libras)" : "🗣️ Ouvinte"}</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="font-medium text-base">{msg.text}</p>

                      {msg.rawGlosses && (
                        <div className="mt-2 pt-2 border-t border-white/20 flex flex-wrap gap-1">
                          {msg.rawGlosses.map((g, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-black/20 rounded font-bold">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          onClick={() => speakText(msg.text)}
                          className="p-1 hover:opacity-80 transition"
                          title="Ouvir novamente"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
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
          </div>
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
                    <p className="text-[11px] text-gray-500 italic">💡 {item.visualTip}</p>
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
    </div>
  );
}