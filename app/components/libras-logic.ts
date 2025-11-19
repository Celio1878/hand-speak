import type {Category, NormalizedLandmark} from "@mediapipe/tasks-vision";

type HandShape = {
  letter: string;
  confidence: number;
};

// MediaPipe Landmark Indices
const THUMB_TIP = 4;
// const INDEX_TIP = 8;
// const MIDDLE_TIP = 12;
// const RING_TIP = 16;
// const PINKY_TIP = 20;
//
// const THUMB_MCP = 2; // Base of thumb
const INDEX_MCP = 5; // Base of index

export function analyzeHandSign(landmarks: NormalizedLandmark[], handedness: Category): HandShape | null {
  if (!landmarks || landmarks.length === 0) return null;

  // 1. Detect Open Fingers
  // A finger is "open" if the tip is higher (lower Y value) than the pip joint
  const isFingerOpen = (tipIdx: number, pipIdx: number) => {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  };

  const indexOpen = isFingerOpen(8, 6);
  const middleOpen = isFingerOpen(12, 10);
  const ringOpen = isFingerOpen(16, 14);
  const pinkyOpen = isFingerOpen(20, 18);

  // Thumb is tricky: we check X distance relative to the palm or index finger
  // For Right Hand: Thumb is open if Tip.x < IP.x (moves left/out)
  const isRightHand = handedness.displayName === "Right";
  const thumbTip = landmarks[THUMB_TIP];
  const thumbIp = landmarks[3];
  const thumbOpen = isRightHand ? thumbTip.x < thumbIp.x : thumbTip.x > thumbIp.x;

  // --- 2. Pattern Matching for LIBRAS ---

  // VOWELS & BASICS

  // A: Fist, thumb upright against index
  if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && thumbTip.y < landmarks[INDEX_MCP].y) {
    // Distinction between A and S: A has thumb straight up, S has thumb across fingers
    if (Math.abs(thumbTip.x - landmarks[INDEX_MCP].x) < 0.05) return {letter: "A", confidence: 0.9};
  }

  // B: Flat hand, thumb tucked in
  if (indexOpen && middleOpen && ringOpen && pinkyOpen && !thumbOpen) {
    return {letter: "B", confidence: 0.9};
  }

  // C: All fingers curved (not fully open, not fully closed)
  // We check if tips are roughly vertically aligned with bases, forming a C
  // (Simplified logic for C)
  if (indexOpen && middleOpen && ringOpen && !pinkyOpen && thumbOpen) {
    // Refinement needed for real C vs E, but this is close to C shape in 2D
    return {letter: "C", confidence: 0.7};
  }

  // D: Index up, others curled, forming a circle with thumb
  if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    return {letter: "D", confidence: 0.9};
  }

  // E: Claw shape (fingers curled down touching thumb?)
  // Often recognized when all fingers are closed but tips are high

  // I: Pinky only
  if (!indexOpen && !middleOpen && !ringOpen && pinkyOpen) {
    return {letter: "I", confidence: 0.9};
  }

  // L: Thumb and Index (90 degrees)
  if (thumbOpen && indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    return {letter: "L", confidence: 0.95};
  }

  // V: Index and Middle
  if (!thumbOpen && indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
    return {letter: "V", confidence: 0.9};
  }

  // W: Index, Middle, Ring
  if (!thumbOpen && indexOpen && middleOpen && ringOpen && !pinkyOpen) {
    return {letter: "W", confidence: 0.9};
  }

  // Y: Hang loose (Thumb + Pinky)
  if (thumbOpen && !indexOpen && !middleOpen && !ringOpen && pinkyOpen) {
    return {letter: "Y", confidence: 0.9};
  }

  // --- THE TRICKY ONES: F vs T ---
  // Both have index curled down.
  // F = Thumb OUTSIDE (Fora).
  // T = Thumb INSIDE (Tras).
  if (!indexOpen && middleOpen && ringOpen && pinkyOpen) {
    // Check Thumb X relative to Index X
    // For Right Hand: If Thumb X is greater (right) of Index, it's outside?
    // Actually, looking at palm:
    // F: Thumb tip is to the RIGHT of Index knuckle (Right Hand)
    // T: Thumb tip is to the LEFT of Index knuckle (Right Hand)

    const diff = thumbTip.x - landmarks[INDEX_MCP].x;

    if (isRightHand) {
      if (diff > 0) return {letter: "F", confidence: 0.8}; // Outside
      else return {letter: "T", confidence: 0.8};          // Inside
    } else {
      // Left hand logic flipped
      if (diff < 0) return {letter: "F", confidence: 0.8};
      else return {letter: "T", confidence: 0.8};
    }
  }

  return null;
}

// LibrasLogic.ts

// ... existing imports ...

// A simple movement analyzer
export function analyzeMovement(history: NormalizedLandmark[][]): string | null {
  if (history.length < 10) return null; // Need at least 10 frames to detect movement

  const current = history[history.length - 1];
  const past = history[history.length - 10]; // Compare with ~300ms ago

  // INDEX FINGER TIP (Landmark 8)
  const currX = current[8].x;
  const currY = current[8].y;
  const pastX = past[8].x;
  const pastY = past[8].y;

  // Calculate distance moved
  const deltaX = currX - pastX;
  const deltaY = currY - pastY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  // Threshold: Hand must move at least 10% of screen width to count as movement
  if (distance < 0.1) return null;

  // --- DETECT PATTERNS ---

  // 1. Letter "Z" (Zig Zag)
  // This is complex, but a simple check is rapid horizontal movement + diagonal
  // For now, let's detect a simple "Swipe" which is often used for Z or J context

  // 2. Letter "J" (Scooping motion)
  // J usually starts high and hooks down and up.
  // Check if Y went down (positive change) then up.

  // Simple Directional Check for Demo:
  if (Math.abs(deltaX) > 0.15 && Math.abs(deltaY) < 0.1) {
    return "Moving Side"; // Could be part of Z
  }

  if (deltaY > 0.15) {
    return "Moving Down"; // Start of J
  }

  // Specific check for "J" (simplified: Index finger draws a 'J' shape)
  // Real implementation requires tracking the curve, but here is the placeholder:
  // if (detectCurve(history)) return "J";

  return null;
}