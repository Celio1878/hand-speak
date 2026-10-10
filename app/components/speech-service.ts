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
