// TranscriptionEngine.ts
import type {GestureToken} from "./libras-logic";

// Faster confirmation to match conversational speed
export const HOLD_DURATION = 400; // ms to hold before typing
const EARLY_LOCK_MS = 250; // if confidence is high, lock earlier
const HIGH_CONFIDENCE = 0.90;

export type TranscriptionState = {
  currentLetter: string | null; // letter/number being held right now (for UI ring)
  progress: number; // 0 to 100
  confirmedLetter: string | null; // emitted when a letter/number locks-in
  confirmedWord?: string | null; // emitted immediately when a word gesture is detected
};

let lastLetter: string | null = null;
let holdStartTime: number = 0;

// Word cooldown to avoid repeating the same word each frame
let lastWord: string | null = null;
let lastWordTime = 0;
const WORD_COOLDOWN = 700; // ms

export function processTranscription(token: GestureToken | null): TranscriptionState {
  const now = performance.now();

  // No detection
  if (!token) {
    // Do not reset holdStartTime to preserve progress briefly; but clear currentLetter UI
    return {currentLetter: null, progress: 0, confirmedLetter: null, confirmedWord: null};
  }

  if (token.type === "WORD") {
    // Immediate confirmation with cooldown
    if (token.value === lastWord && now - lastWordTime < WORD_COOLDOWN) {
      return {currentLetter: null, progress: 0, confirmedLetter: null, confirmedWord: null};
    }
    lastWord = String(token.value);
    lastWordTime = now;
    return {currentLetter: null, progress: 0, confirmedLetter: null, confirmedWord: String(token.value)};
  }

  // Handle NUMBER type (convert to string for display)
  if (token.type === "NUMBER") {
    token.value = String(token.value);
  }

  // Letter/Number logic with hold-to-type
  const detectedLetter = String(token.value);

  if (!detectedLetter) {
    return {currentLetter: null, progress: 0, confirmedLetter: null, confirmedWord: null};
  }

  if (detectedLetter !== lastLetter) {
    lastLetter = detectedLetter;
    holdStartTime = now; // Reset timer
    return {currentLetter: detectedLetter, progress: 0, confirmedLetter: null, confirmedWord: null};
  }

  const elapsed = now - holdStartTime;
  const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);

  // Early lock path for very confident, stable detections
  if (token.confidence >= HIGH_CONFIDENCE && elapsed >= EARLY_LOCK_MS) {
    holdStartTime = now + 300; // small debounce
    return {
      currentLetter: detectedLetter,
      progress: Math.max(progress, 100),
      confirmedLetter: detectedLetter,
      confirmedWord: null,
    };
  }

  if (elapsed >= HOLD_DURATION) {
    // Reset after confirm so we don't type repeatedly; require slight delay
    holdStartTime = now + 400; // debounce window
    return {
      currentLetter: detectedLetter,
      progress: 100,
      confirmedLetter: detectedLetter,
      confirmedWord: null,
    };
  }

  return {
    currentLetter: detectedLetter,
    progress,
    confirmedLetter: null,
    confirmedWord: null,
  };
}