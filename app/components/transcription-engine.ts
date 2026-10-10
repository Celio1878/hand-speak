import type { GestureToken } from "./libras-logic";

export const DEFAULT_HOLD_DURATION = 320; // ms de sustentação para travar letra (otimizado e ágil)
const EARLY_LOCK_MS = 200; // ms para trava antecipada com alta confiança
const HIGH_CONFIDENCE = 0.90;

export type TranscriptionState = {
  currentSign: string | null; // Símbolo atual sendo sustentado
  progress: number; // 0 a 100%
  confirmedLetter: string | null;
  confirmedWord: string | null;
  confirmedNumber: number | null;
};

let lastSign: string | null = null;
let holdStartTime: number = 0;
let lastWordEmitted: string | null = null;
let lastWordTime = 0;
const WORD_COOLDOWN = 1100; // ms

export function processTranscription(
  token: GestureToken | null,
  holdDurationMs: number = DEFAULT_HOLD_DURATION
): TranscriptionState {
  const now = performance.now();

  if (!token) {
    return {
      currentSign: null,
      progress: 0,
      confirmedLetter: null,
      confirmedWord: null,
      confirmedNumber: null,
    };
  }

  // 1. Tratamento imediato de Palavras/Expressões com Cooldown
  if (token.type === "WORD") {
    const wordStr = String(token.value);
    if (wordStr === lastWordEmitted && now - lastWordTime < WORD_COOLDOWN) {
      return {
        currentSign: null,
        progress: 0,
        confirmedLetter: null,
        confirmedWord: null,
        confirmedNumber: null,
      };
    }
    lastWordEmitted = wordStr;
    lastWordTime = now;

    return {
      currentSign: null,
      progress: 0,
      confirmedLetter: null,
      confirmedWord: wordStr,
      confirmedNumber: null,
    };
  }

  // 2. Tratamento de Letras e Números com Hold-to-type
  const detectedSign = String(token.value);

  if (detectedSign !== lastSign) {
    lastSign = detectedSign;
    holdStartTime = now;
    return {
      currentSign: detectedSign,
      progress: 0,
      confirmedLetter: null,
      confirmedWord: null,
      confirmedNumber: null,
    };
  }

  const elapsed = now - holdStartTime;
  const progress = Math.min((elapsed / holdDurationMs) * 100, 100);

  // Trava antecipada para alta confiança e estabilidade
  if (token.confidence >= HIGH_CONFIDENCE && elapsed >= EARLY_LOCK_MS) {
    holdStartTime = now + 280; // Debounce otimizado
    return {
      currentSign: detectedSign,
      progress: 100,
      confirmedLetter: token.type === "LETTER" ? detectedSign : null,
      confirmedWord: null,
      confirmedNumber: token.type === "NUMBER" ? Number(detectedSign) : null,
    };
  }

  // Trava regular ao atingir a duração
  if (elapsed >= holdDurationMs) {
    holdStartTime = now + 300; // Debounce window
    return {
      currentSign: detectedSign,
      progress: 100,
      confirmedLetter: token.type === "LETTER" ? detectedSign : null,
      confirmedWord: null,
      confirmedNumber: token.type === "NUMBER" ? Number(detectedSign) : null,
    };
  }

  return {
    currentSign: detectedSign,
    progress,
    confirmedLetter: null,
    confirmedWord: null,
    confirmedNumber: null,
  };
}

export function resetTranscriptionEngine(): void {
  lastSign = null;
  holdStartTime = 0;
  lastWordEmitted = null;
  lastWordTime = 0;
}