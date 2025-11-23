import type {Category, NormalizedLandmark} from "@mediapipe/tasks-vision";
import {analyzeNumberSign} from "./libras-numbers";

export type GestureToken = {
  type: "LETTER" | "WORD" | "NUMBER";
  value: string | number; // letter (A-Z), word like "OI", or number (0-10)
  confidence: number; // 0..1
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

// Utility: clamp
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Analyze a single frame hand pose and try to map it to a LIBRAS LETTER or NUMBER token
export function analyzeHandSign(landmarks: NormalizedLandmark[], handedness: Category): GestureToken | null {
  if (!landmarks || landmarks.length === 0) return null;

  // First, try number detection (numbers have priority in some contexts)
  const numberToken = analyzeNumberSign(landmarks, handedness);
  if (numberToken && numberToken.confidence > 0.85) {
    return {type: "NUMBER", value: numberToken.value, confidence: numberToken.confidence};
  }

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

  // VOWELS & BASICS (subset; simplified heuristics)

  // A: Fist, thumb upright against index
  if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && thumbTip.y < landmarks[INDEX_MCP].y) {
    // Distinction between A and S: A has thumb straight up, S has thumb across fingers
    if (Math.abs(thumbTip.x - landmarks[INDEX_MCP].x) < 0.05) return {type: "LETTER", value: "A", confidence: 0.9};
  }

  // B: Flat hand, thumb tucked in
  if (indexOpen && middleOpen && ringOpen && pinkyOpen && !thumbOpen) {
    return {type: "LETTER", value: "B", confidence: 0.9};
  }

  // O and P: Both form a circle, but different orientations
  // O: Horizontal circle (thumb and index close, hand sideways)
  // P: Vertical circle pointing down (thumb and index close, hand pointing down)
  if (thumbOpen && indexOpen) {
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[8].x, 2) +
      Math.pow(thumbTip.y - landmarks[8].y, 2)
    );

    // If thumb and index form a circle (close together)
    if (thumbIndexDist < 0.08) {
      const indexTip = landmarks[8];
      const wrist = landmarks[0];

      // Check orientation: measure if index is pointing down (P) or sideways (O)
      // P: index tip is significantly below wrist (pointing down)
      // O: index tip is around same level as wrist (horizontal)
      const verticalDiff = indexTip.y - wrist.y;

      if (verticalDiff > 0.15) {
        // Pointing down = P
        return {type: "LETTER", value: "P", confidence: 0.90};
      } else {
        // Horizontal = O
        return {type: "LETTER", value: "O", confidence: 0.88};
      }
    }
  }

  // C: All fingers curved (not fully open, not fully closed)
  // We check if tips are roughly vertically aligned with bases, forming a C
  if (indexOpen && middleOpen && ringOpen && !pinkyOpen && thumbOpen) {
    // Refinement needed for real C vs E, but this is close to C shape in 2D
    return {type: "LETTER", value: "C", confidence: 0.7};
  }

  // D: Index up, others curled, forming a circle with thumb
  if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    return {type: "LETTER", value: "D", confidence: 0.9};
  }

  // E: All fingers curled, fist with fingers curled inward (claw)
  if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
    // Check if tips are curled (Y values of tips close to PIPs)
    const indexCurled = Math.abs(landmarks[8].y - landmarks[6].y) < 0.05;
    const middleCurled = Math.abs(landmarks[12].y - landmarks[10].y) < 0.05;

    if (indexCurled && middleCurled) {
      return {type: "LETTER", value: "E", confidence: 0.82};
    }
  }

  // S: Fist with thumb across fingers (similar to A but thumb sideways)
  if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    const thumbAcross = Math.abs(thumbTip.y - landmarks[INDEX_MCP].y) < 0.08;
    if (thumbAcross && Math.abs(thumbTip.x - landmarks[INDEX_MCP].x) > 0.03) {
      return {type: "LETTER", value: "S", confidence: 0.85};
    }
  }

  // M: Three fingers down, thumb tucked (similar to T/N/M family)
  // N: Two fingers down, thumb between
  // (These are complex and require more context; simplified here)

  // X: Index bent forming hook
  if (!middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
    const indexBent = landmarks[8].y > landmarks[6].y && landmarks[8].y < landmarks[5].y;
    if (indexBent) {
      return {type: "LETTER", value: "X", confidence: 0.80};
    }
  }

  // Q: Similar to G but pointing down
  // G: Index pointing sideways with thumb parallel
  // R: Index and middle crossed
  // K: Index up, middle out at angle (complex)
  // (These require more detailed 3D analysis; placeholders for now)

  // I: Pinky only, thumb tucked in (not extended)
  if (!indexOpen && !middleOpen && !ringOpen && pinkyOpen && !thumbOpen) {
    // Additional check: thumb should be tucked against palm, not sticking out
    const thumbPinkyXDist = Math.abs(thumbTip.x - landmarks[20].x);

    // If thumb is far from pinky horizontally, it's more likely Y
    if (thumbPinkyXDist > 0.15) {
      return null; // Might be Y, let Y handler catch it
    }

    return {type: "LETTER", value: "I", confidence: 0.92};
  }

  // L: Thumb and Index (90 degrees)
  if (thumbOpen && indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    return {type: "LETTER", value: "L", confidence: 0.95};
  }

  // U: Index and Middle together (parallel, not spread)
  if (!thumbOpen && indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const fingerDistance = Math.abs(indexTip.x - middleTip.x);

    // If fingers are close together (< 0.03), it's U; if spread (> 0.05), it's V
    if (fingerDistance < 0.03) {
      return {type: "LETTER", value: "U", confidence: 0.88};
    } else if (fingerDistance > 0.05) {
      return {type: "LETTER", value: "V", confidence: 0.90};
    }
    // Medium distance - default to V but lower confidence
    return {type: "LETTER", value: "V", confidence: 0.75};
  }

  // W: Index, Middle, Ring
  if (!thumbOpen && indexOpen && middleOpen && ringOpen && !pinkyOpen) {
    return {type: "LETTER", value: "W", confidence: 0.9};
  }

  // Y: Hang loose (Thumb + Pinky extended, others closed)
  if (thumbOpen && !indexOpen && !middleOpen && !ringOpen && pinkyOpen) {
    // Verify both thumb and pinky are truly extended and spread apart
    const thumbPinkyXDist = Math.abs(thumbTip.x - landmarks[20].x);
    const thumbPinkyYDist = Math.abs(thumbTip.y - landmarks[20].y);

    // Both should be extended with significant horizontal distance
    // Y has a "hang loose" shape with thumb and pinky far apart
    if (thumbPinkyXDist > 0.12 || thumbPinkyYDist > 0.15) {
      return {type: "LETTER", value: "Y", confidence: 0.93};
    }

    // If they're close, might be misdetected - lower confidence
    return {type: "LETTER", value: "Y", confidence: 0.70};
  }

  // --- THE TRICKY ONES: F vs T vs OK ---
  // F: Index curled touching thumb (3 fingers up: middle, ring, pinky)
  // T: Index curled with thumb between index and middle (3 fingers up)
  // OK: Thumb and index forming circle (3 fingers up)

  if (!indexOpen && middleOpen && ringOpen && pinkyOpen) {
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];

    // Measure thumb-index distance
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2)
    );

    // Measure thumb-index PIP distance (where thumb goes "through")
    const thumbIndexPipDist = Math.sqrt(
      Math.pow(thumbTip.x - indexPip.x, 2) +
      Math.pow(thumbTip.y - indexPip.y, 2)
    );

    // F: Thumb tip touching index tip/knuckle (forming OK-like shape but with 3 fingers)
    if (thumbIndexDist < 0.06) {
      return {type: "LETTER", value: "F", confidence: 0.88};
    }

    // T: Thumb between index and middle (thumb tip close to index PIP)
    if (thumbIndexPipDist < 0.08 && thumbIndexDist > 0.08) {
      return {type: "LETTER", value: "T", confidence: 0.85};
    }

    // Default to F if ambiguous
    return {type: "LETTER", value: "F", confidence: 0.70};
  }

  // Fallback: if no letter matched but number had lower confidence, return number
  if (numberToken) {
    return {type: "NUMBER", value: numberToken.value, confidence: numberToken.confidence};
  }

  return null;
}

// LibrasLogic.ts

// ... existing imports ...

// Analyze recent motion to detect WORD gestures and motion-based letters (Z)
// Returns a WORD token such as "OI", "SIM", "NAO" or motion LETTER like "Z"
export function analyzeWordGesture(history: NormalizedLandmark[][], handedness?: Category): GestureToken | null {
  if (!history || history.length < 12) return null; // ~200ms+ history window at 60fps

  const n = history.length;
  const wristIdx = 0; // Wrist landmark
  const indexTipIdx = 8;

  const first = history[n - 12];
  const mid = history[n - 6];
  const last = history[n - 1];

  const fx = first[wristIdx].x, fy = first[wristIdx].y;
  const mx = mid[wristIdx].x, my = mid[wristIdx].y;
  const lx = last[wristIdx].x, ly = last[wristIdx].y;

  const dx1 = mx - fx; // early -> mid
  const dx2 = lx - mx; // mid -> last
  const dyTotal = ly - fy;
  const dxTotal = lx - fx;

  const abs = Math.abs;

  // Pattern 1: "OI" (wave) — horizontal oscillation of wrist direction within short time
  // Detect a left-right change of direction with sufficient amplitude.
  const changedDirection = (dx1 > 0 && dx2 < 0) || (dx1 < 0 && dx2 > 0);
  const amplitude = abs(dx1) + abs(dx2);
  if (changedDirection && amplitude > 0.18 && abs(dyTotal) < 0.08) {
    return {type: "WORD", value: "OI", confidence: clamp(amplitude, 0.6, 1)};
  }

  // Pattern 2: "SIM" (thumbs up, small vertical bob)
  // Heuristic: Thumb + Pinky extended like Y or just thumb extended, with gentle up-down movement.
  const lastFrame = last;
  const thumbTip = lastFrame[THUMB_TIP];
  const indexMcp = lastFrame[INDEX_MCP];
  const thumbUp = thumbTip.y < indexMcp.y; // thumb elevated
  if (thumbUp && abs(dyTotal) > 0.12 && abs(dxTotal) < 0.08) {
    return {type: "WORD", value: "SIM", confidence: clamp(abs(dyTotal), 0.6, 1)};
  }

  // Pattern 3: "NAO" (side-to-side shake with index pointing)
  const indexPointing = last[indexTipIdx].y < last[6].y; // index tip above PIP
  if (indexPointing && abs(dxTotal) > 0.2 && abs(dyTotal) < 0.08) {
    return {type: "WORD", value: "NAO", confidence: clamp(abs(dxTotal), 0.6, 1)};
  }

  // Pattern 4: "Z" (zigzag motion with index finger)
  // Z requires a diagonal down-right, then down-left motion (or similar zigzag)
  // Check for index finger pointing and creating a Z-shaped path
  if (n >= 18) {
    const start = history[n - 18];
    const quarter = history[n - 13];
    const mid = history[n - 9];
    const threeQuarter = history[n - 5];
    const end = last;

    // Check if index is extended throughout
    const allIndexExtended = [start, quarter, mid, threeQuarter, end].every(
      (frame) => frame[indexTipIdx].y < frame[6].y
    );

    if (allIndexExtended) {
      // Measure Z pattern: right-down, then left-down
      const dx1 = quarter[indexTipIdx].x - start[indexTipIdx].x;
      const dy1 = quarter[indexTipIdx].y - start[indexTipIdx].y;
      const dx2 = mid[indexTipIdx].x - quarter[indexTipIdx].x;
      const dy2 = mid[indexTipIdx].y - quarter[indexTipIdx].y;
      const dx3 = end[indexTipIdx].x - mid[indexTipIdx].x;
      const dy3 = end[indexTipIdx].y - mid[indexTipIdx].y;

      // Z pattern: dx1 > 0 (right), dx2 < 0 (left), dy should be positive (downward)
      const isZPattern =
        dx1 > 0.08 && dx2 < -0.08 && dy1 > 0 && dy2 > 0 && abs(dy1 + dy2 + dy3) > 0.12;

      if (isZPattern) {
        return {type: "LETTER", value: "Z", confidence: 0.85};
      }
    }
  }

  return null;
}