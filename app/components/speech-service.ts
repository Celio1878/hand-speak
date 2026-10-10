// Web Speech API Service for Brazilian Portuguese (TTS & STT)

export type SpeechOptions = {
  rate?: number; // 0.8 - 1.2
  pitch?: number; // 0.8 - 1.2
  onEnd?: () => void;
};

// --- Text-To-Speech (TTS) ---
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getBestPtBrVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "pt-BR" && v.name.includes("Google")) ||
    voices.find((v) => v.lang === "pt-BR" && v.name.includes("Natural")) ||
    voices.find((v) => v.lang === "pt-BR") ||
    voices.find((v) => v.lang.startsWith("pt")) ||
    null
  );
}

export function speakText(text: string, options?: SpeechOptions): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;

  try {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = options?.rate ?? 1.0;
    utterance.pitch = options?.pitch ?? 1.0;

    const voice = getBestPtBrVoice();
    if (voice) {
      utterance.voice = voice;
    }

    if (options?.onEnd) {
      utterance.onend = () => options.onEnd?.();
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("Erro ao sintetizar fala:", err);
  }
}

// --- Speech-To-Text (STT) ---
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let activeRecognition: any = null;

export function startSpeechRecognition(
  onTranscript: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void
): () => void {
  if (!isSpeechRecognitionSupported()) {
    onError("O seu navegador não suporta reconhecimento de fala por microfone.");
    return () => {};
  }

  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  try {
    if (activeRecognition) {
      activeRecognition.abort();
    }

    const recognition = new SpeechRecognitionClass();
    activeRecognition = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          final += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (final) {
        onTranscript(final.trim(), true);
      } else if (interim) {
        onTranscript(interim.trim(), false);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        onError(`Microfone: ${event.error || "erro ao capturar áudio"}`);
      }
    };

    recognition.onend = () => {
      activeRecognition = null;
    };

    recognition.start();

    return () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop error
      }
      activeRecognition = null;
    };
  } catch (err) {
    onError("Não foi possível acessar o microfone.");
    return () => {};
  }
}

// --- Gravação de Áudio via MediaRecorder (Cross-Browser / Firefox) ---
export function isAudioRecordingSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

export type AudioRecorderHandle = {
  stop: () => void;
};

export function startAudioRecording(
  onRecorded: (blob: Blob) => void,
  onError: (error: string) => void,
  maxDurationSeconds = 30
): Promise<AudioRecorderHandle> {
  if (!isAudioRecordingSupported()) {
    onError("Gravação de áudio não suportada neste dispositivo.");
    return Promise.reject(new Error("Audio recording unsupported"));
  }

  // Tenta encontrar o melhor MIME type suportado pelo navegador
  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  const supportedMimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";

  return navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      let recorder: MediaRecorder;
      try {
        recorder = supportedMimeType
          ? new MediaRecorder(stream, { mimeType: supportedMimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      const chunks: BlobPart[] = [];
      let timeoutId: number | null = null;
      let isCleanedUp = false;

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (timeoutId) clearTimeout(timeoutId);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        cleanup();
        const finalType = recorder.mimeType || supportedMimeType || "audio/webm";
        const blob = new Blob(chunks, { type: finalType });
        if (blob.size > 0) {
          onRecorded(blob);
        } else {
          onError("Nenhum áudio foi capturado.");
        }
      };

      recorder.onerror = () => {
        cleanup();
        onError("Erro durante a gravação de áudio.");
      };

      recorder.start();

      // Temporizador de segurança
      timeoutId = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, maxDurationSeconds * 1000);

      return {
        stop: () => {
          if (recorder.state === "recording") {
            recorder.stop();
          } else {
            cleanup();
          }
        },
      };
    })
    .catch((err: unknown) => {
      const errorObj = err as { name?: string };
      const errMsg =
        errorObj.name === "NotAllowedError" || errorObj.name === "PermissionDeniedError"
          ? "Permissão de microfone negada. Autorize o microfone para continuar."
          : "Não foi possível acessar o microfone.";
      onError(errMsg);
      throw err;
    });
}

