import type {Category, NormalizedLandmark} from "@mediapipe/tasks-vision";

export type NumberToken = {
  type: "NUMBER";
  value: number; // 0-10
  confidence: number; // 0..1
};

// Analyze hand pose and try to map it to a LIBRAS NUMBER (0-10)
export function analyzeNumberSign(landmarks: NormalizedLandmark[], handedness: Category): NumberToken | null {
  if (!landmarks || landmarks.length === 0) return null;

  // Detect Open Fingers
  const isFingerOpen = (tipIdx: number, pipIdx: number) => {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  };

  const indexOpen = isFingerOpen(8, 6);
  const middleOpen = isFingerOpen(12, 10);
  const ringOpen = isFingerOpen(16, 14);
  const pinkyOpen = isFingerOpen(20, 18);

  // Thumb detection
  const isRightHand = handedness.displayName === "Right";
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbOpen = isRightHand ? thumbTip.x < thumbIp.x : thumbTip.x > thumbIp.x;

  // Count extended fingers for numbers 1-5
  const extendedFingers = [indexOpen, middleOpen, ringOpen, pinkyOpen, thumbOpen].filter(Boolean).length;

  // --- NUMBER PATTERNS ---

  // 1: Only index finger extended
  if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
    return {type: "NUMBER", value: 1, confidence: 0.95};
  }

  // 2: Index and middle fingers extended
  if (indexOpen && middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
    return {type: "NUMBER", value: 2, confidence: 0.93};
  }

  // 3: Index, middle, and ring fingers extended (or thumb + index + middle)
  if (indexOpen && middleOpen && ringOpen && !pinkyOpen && !thumbOpen) {
    return {type: "NUMBER", value: 3, confidence: 0.92};
  }
  // Alternative 3: Thumb + Index + Middle
  if (thumbOpen && indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
    return {type: "NUMBER", value: 3, confidence: 0.88};
  }

  // 4: All fingers except thumb extended
  if (indexOpen && middleOpen && ringOpen && pinkyOpen && !thumbOpen) {
    return {type: "NUMBER", value: 4, confidence: 0.93};
  }

  // 5: All fingers extended (open hand)
  if (indexOpen && middleOpen && ringOpen && pinkyOpen && thumbOpen) {
    return {type: "NUMBER", value: 5, confidence: 0.95};
  }

  // 6: Thumb touching pinky tip (thumb extended, pinky curled to touch)
  // Simplified: Thumb open, others closed except detecting touch
  if (thumbOpen && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    const thumbPinkyDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[20].x, 2) +
      Math.pow(thumbTip.y - landmarks[20].y, 2)
    );
    if (thumbPinkyDist < 0.1) {
      return {type: "NUMBER", value: 6, confidence: 0.85};
    }
  }

  // 7: Thumb extended pointing up, all fingers closed (like A but thumb up)
  if (thumbOpen && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
    // Check if thumb is pointing upward
    if (thumbTip.y < landmarks[2].y) {
      return {type: "NUMBER", value: 7, confidence: 0.88};
    }
  }

  // 8: Thumb + index forming circle (like OK sign), others extended or middle finger touching thumb
  if (indexOpen && middleOpen && ringOpen && pinkyOpen) {
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[8].x, 2) +
      Math.pow(thumbTip.y - landmarks[8].y, 2)
    );

    // Thumb and middle finger close (forming 8)
    const thumbMiddleDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[12].x, 2) +
      Math.pow(thumbTip.y - landmarks[12].y, 2)
    );

    if (thumbMiddleDist < 0.08) {
      return {type: "NUMBER", value: 8, confidence: 0.86};
    }
  }

  // 9: Thumb + index forming circle (OK sign)
  if (thumbOpen && indexOpen) {
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[8].x, 2) +
      Math.pow(thumbTip.y - landmarks[8].y, 2)
    );

    if (thumbIndexDist < 0.08 && !middleOpen && !ringOpen && !pinkyOpen) {
      return {type: "NUMBER", value: 9, confidence: 0.87};
    }
  }

  // 0: Thumb and index forming large circle (O shape)
  if (thumbOpen && indexOpen && middleOpen && ringOpen && pinkyOpen) {
    const thumbIndexDist = Math.sqrt(
      Math.pow(thumbTip.x - landmarks[8].x, 2) +
      Math.pow(thumbTip.y - landmarks[8].y, 2)
    );

    if (thumbIndexDist < 0.10) {
      return {type: "NUMBER", value: 0, confidence: 0.85};
    }
  }

  // 10: Can be represented as 1 followed by 0, or a specific two-hand gesture
  // For single hand: Fist with index pointing (1) + other hand showing 0
  // This requires two-hand detection, so we'll skip for now

  return null;
}

// Helper to combine number tokens into multi-digit numbers (e.g., 1 + 0 = 10)
export function combineNumberSequence(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0];

  // Combine digits: [1, 0] -> 10, [2, 5] -> 25
  return parseInt(numbers.join(''), 10);
}
