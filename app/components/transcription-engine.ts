// TranscriptionEngine.ts

export const HOLD_DURATION = 1200; // ms to hold before typing

type TranscriptionState = {
  currentLetter: string | null;
  progress: number; // 0 to 100
  confirmedLetter: string | null; // Returns the letter ONLY when confirmed
};

let lastLetter: string | null = null;
let holdStartTime: number = 0;

export function processTranscription(detectedLetter: string | null): TranscriptionState {
  const now = performance.now();

  // Case 1: Hand lost or gesture stopped
  if (!detectedLetter) {
    lastLetter = null;
    return {currentLetter: null, progress: 0, confirmedLetter: null};
  }

  // Case 2: New letter detected (different from previous)
  if (detectedLetter !== lastLetter) {
    lastLetter = detectedLetter;
    holdStartTime = now; // Reset timer
    return {currentLetter: detectedLetter, progress: 0, confirmedLetter: null};
  }

  // Case 3: Holding the SAME letter
  const elapsed = now - holdStartTime;
  const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);

  if (elapsed >= HOLD_DURATION) {
    // RESET after confirm so we don't type "AAAA" continuously
    // We force the user to slightly release or wait (simple debounce)
    holdStartTime = now + 500; // Add a small delay before next register
    return {
      currentLetter: detectedLetter,
      progress: 100,
      confirmedLetter: detectedLetter
    };
  }

  return {
    currentLetter: detectedLetter,
    progress: progress,
    confirmedLetter: null
  };
}