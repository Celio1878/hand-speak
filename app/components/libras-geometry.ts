import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type HandMetrics = {
  scale: number; // Intrinsic scale based on wrist to middle MCP
  wrist: NormalizedLandmark;
  palmNormal: { x: number; y: number; z: number };
  fingerFlexions: {
    thumb: number; // 0 = fully extended, 1 = fully curled/folded
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  fingerOpen: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
};

// Euclidean distance in 3D
export function distance3D(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 2D Distance for projected screen coordinates
export function distance2D(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Computes 3D normal vector of the palm
export function calculatePalmNormal(
  landmarks: NormalizedLandmark[],
  isRightHand: boolean
): { x: number; y: number; z: number } {
  if (landmarks.length < 21) return { x: 0, y: 0, z: -1 };

  const p0 = landmarks[0]; // Wrist
  const p5 = landmarks[5]; // Index MCP
  const p17 = landmarks[17]; // Pinky MCP

  const v1 = { x: p5.x - p0.x, y: p5.y - p0.y, z: (p5.z || 0) - (p0.z || 0) };
  const v2 = { x: p17.x - p0.x, y: p17.y - p0.y, z: (p17.z || 0) - (p0.z || 0) };

  // Cross product (v1 x v2)
  let nx = v1.y * v2.z - v1.z * v2.y;
  let ny = v1.z * v2.x - v1.x * v2.z;
  let nz = v1.x * v2.y - v1.y * v2.x;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const handMultiplier = isRightHand ? 1 : -1;

  return {
    x: (nx / len) * handMultiplier,
    y: (ny / len) * handMultiplier,
    z: (nz / len) * handMultiplier,
  };
}

// Computes normalized hand metrics
export function extractHandMetrics(
  landmarks: NormalizedLandmark[],
  isRightHand: boolean
): HandMetrics | null {
  if (!landmarks || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const scale = distance3D(wrist, middleMcp) || 0.1;

  const palmNormal = calculatePalmNormal(landmarks, isRightHand);

  // Finger Curl calculation: ratio of Tip-MCP distance relative to maximum finger length
  const computeFingerCurl = (
    tipIdx: number,
    pipIdx: number,
    mcpIdx: number
  ): number => {
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    const mcp = landmarks[mcpIdx];

    const distTipMcp = distance3D(tip, mcp);
    const distPipMcp = distance3D(pip, mcp);
    const distTipPip = distance3D(tip, pip);
    const totalLength = distPipMcp + distTipPip;

    if (totalLength === 0) return 0;
    // ratio: 1 when completely straight, ~0.3-0.4 when curled
    const straightness = Math.min(1, distTipMcp / totalLength);
    // return curl where 0 = straight, 1 = curled
    return Math.max(0, Math.min(1, 1 - (straightness - 0.35) / 0.65));
  };

  const indexCurl = computeFingerCurl(8, 6, 5);
  const middleCurl = computeFingerCurl(12, 10, 9);
  const ringCurl = computeFingerCurl(16, 14, 13);
  const pinkyCurl = computeFingerCurl(20, 18, 17);

  // Thumb curl & abduction
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const indexMcp = landmarks[5];
  const thumbDistFromIndex = distance3D(thumbTip, indexMcp) / scale;
  const thumbCurl = Math.max(0, Math.min(1, 1 - thumbDistFromIndex / 0.8));

  // Determine if fingers are open
  const indexOpen = indexCurl < 0.45;
  const middleOpen = middleCurl < 0.45;
  const ringOpen = ringCurl < 0.45;
  const pinkyOpen = pinkyCurl < 0.45;
  const thumbOpen = thumbCurl < 0.50;

  return {
    scale,
    wrist,
    palmNormal,
    fingerFlexions: {
      thumb: thumbCurl,
      index: indexCurl,
      middle: middleCurl,
      ring: ringCurl,
      pinky: pinkyCurl,
    },
    fingerOpen: {
      thumb: thumbOpen,
      index: indexOpen,
      middle: middleOpen,
      ring: ringOpen,
      pinky: pinkyOpen,
    },
  };
}

// Two Hand spatial relationship
export type TwoHandRelationship = {
  distance: number; // distance between wrists normalized by avg hand scale
  areTouching: boolean;
  leftHandToRight: { dx: number; dy: number; dz: number };
  bothPalmsFacingEachOther: boolean;
};

export function getTwoHandRelationship(
  leftHand: NormalizedLandmark[],
  rightHand: NormalizedLandmark[]
): TwoHandRelationship | null {
  if (!leftHand || !rightHand || leftHand.length < 21 || rightHand.length < 21) {
    return null;
  }

  const leftMetrics = extractHandMetrics(leftHand, false);
  const rightMetrics = extractHandMetrics(rightHand, true);
  if (!leftMetrics || !rightMetrics) return null;

  const avgScale = (leftMetrics.scale + rightMetrics.scale) / 2;
  const wristDist = distance3D(leftMetrics.wrist, rightMetrics.wrist) / avgScale;

  // Check if fingertips or palms are close
  let minFingertipDist = Infinity;
  const tips = [4, 8, 12, 16, 20];
  for (const t1 of tips) {
    for (const t2 of tips) {
      const d = distance3D(leftHand[t1], rightHand[t2]) / avgScale;
      if (d < minFingertipDist) minFingertipDist = d;
    }
  }

  const areTouching = minFingertipDist < 0.45;

  // Dot product of normals: if facing each other, dot product is negative (~ -1)
  const dotNormals =
    leftMetrics.palmNormal.x * rightMetrics.palmNormal.x +
    leftMetrics.palmNormal.y * rightMetrics.palmNormal.y +
    leftMetrics.palmNormal.z * rightMetrics.palmNormal.z;

  const bothPalmsFacingEachOther = dotNormals < -0.4;

  return {
    distance: wristDist,
    areTouching,
    leftHandToRight: {
      dx: (rightMetrics.wrist.x - leftMetrics.wrist.x) / avgScale,
      dy: (rightMetrics.wrist.y - leftMetrics.wrist.y) / avgScale,
      dz: ((rightMetrics.wrist.z || 0) - (leftMetrics.wrist.z || 0)) / avgScale,
    },
    bothPalmsFacingEachOther,
  };
}
