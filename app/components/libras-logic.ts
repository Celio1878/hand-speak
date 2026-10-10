import type { Category, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { analyzeNumberSign } from "./libras-numbers";
import {
  distance3D,
  distance2D,
  extractHandMetrics,
  getTwoHandRelationship,
} from "./libras-geometry";

export type RecognitionMode = "WORDS" | "ALPHABET" | "NUMBERS";

export type GestureToken = {
  type: "LETTER" | "WORD" | "NUMBER";
  value: string | number;
  confidence: number;
  twoHands?: boolean;
};

// Clamp helper
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Analisa os landmarks de 1 ou 2 mãos e identifica o sinal correspondente
 */
export function analyzeLibrasFrame(
  handsLandmarks: NormalizedLandmark[][],
  handednesses: Category[][],
  mode: RecognitionMode = "WORDS"
): GestureToken | null {
  if (!handsLandmarks || handsLandmarks.length === 0) return null;

  const numHands = handsLandmarks.length;

  // 1. Verificação de Sinais de 2 Mãos (se houver 2 mãos detectadas)
  if (numHands >= 2 && handsLandmarks[0].length >= 21 && handsLandmarks[1].length >= 21) {
    const twoHandToken = analyzeTwoHandGestures(
      handsLandmarks[0],
      handsLandmarks[1],
      handednesses[0]?.[0],
      handednesses[1]?.[0]
    );
    if (twoHandToken) return twoHandToken;
  }

  // 2. Análise da Mão Primária (Mão 0)
  const primaryHand = handsLandmarks[0];
  const primaryCategory = handednesses[0]?.[0] || { displayName: "Right", categoryName: "Right", score: 0.9, index: 0 };

  // Se o modo for estritamente NUMÉRICO
  if (mode === "NUMBERS") {
    const numToken = analyzeNumberSign(primaryHand, primaryCategory);
    if (numToken) return { type: "NUMBER", value: numToken.value, confidence: numToken.confidence };
  }

  // Se o modo for ALFABETO (Datilologia)
  if (mode === "ALPHABET") {
    const letterToken = analyzeAlphabetSign(primaryHand, primaryCategory);
    if (letterToken) return letterToken;
  }

  // Se o modo for PALAVRAS/EXPRESSÕES (ou busca geral)
  if (mode === "WORDS") {
    // Primeiro tenta sinais estáticos de palavras
    const staticWord = analyzeStaticWordSigns(primaryHand, primaryCategory);
    if (staticWord) return staticWord;

    // Se não encontrou palavra estática, avalia alfabeto como fallback
    const letter = analyzeAlphabetSign(primaryHand, primaryCategory);
    if (letter) return letter;
  }

  return null;
}

/**
 * Reconhecimento de Sinais que utilizam DUAS MÃOS (Casa, Por Favor, Ajuda, etc.)
 */
function analyzeTwoHandGestures(
  handA: NormalizedLandmark[],
  handB: NormalizedLandmark[],
  catA?: Category,
  catB?: Category
): GestureToken | null {
  const isRightA = catA?.displayName === "Right";
  const leftHand = isRightA ? handB : handA;
  const rightHand = isRightA ? handA : handB;

  const relationship = getTwoHandRelationship(leftHand, rightHand);
  if (!relationship) return null;

  // SINAL: "CASA" — Pontas dos dedos unidas formando telhado triangular
  const leftFingertips = [8, 12, 16]; // Indicador, Médio, Anelar
  const rightFingertips = [8, 12, 16];
  let tipsTouching = true;
  for (let i = 0; i < leftFingertips.length; i++) {
    const d = distance2D(leftHand[leftFingertips[i]], rightHand[rightFingertips[i]]);
    if (d > 0.12) {
      tipsTouching = false;
      break;
    }
  }

  // Se as pontas tocam e os pulsos estão separados formando telhado
  const wristDist = distance2D(leftHand[0], rightHand[0]);
  if (tipsTouching && wristDist > 0.18) {
    return { type: "WORD", value: "CASA", confidence: 0.92, twoHands: true };
  }

  // SINAL: "POR FAVOR" — Mãos unidas em prece (palmas voltadas uma para a outra e próximas)
  if (relationship.areTouching && relationship.bothPalmsFacingEachOther && wristDist < 0.22) {
    return { type: "WORD", value: "POR FAVOR", confidence: 0.90, twoHands: true };
  }

  // SINAL: "AJUDA" — Punho cerrado de uma mão sobre a palma da outra
  const metricsLeft = extractHandMetrics(leftHand, false);
  const metricsRight = extractHandMetrics(rightHand, true);

  if (metricsLeft && metricsRight) {
    const isOneFist =
      (metricsLeft.fingerFlexions.index > 0.7 && metricsRight.fingerOpen.index) ||
      (metricsRight.fingerFlexions.index > 0.7 && metricsLeft.fingerOpen.index);

    if (isOneFist && relationship.distance < 0.6) {
      return { type: "WORD", value: "AJUDA", confidence: 0.88, twoHands: true };
    }
  }

  return null;
}

/**
 * Reconhecimento de Sinais Estáticos de Palavras Únicas (Sim, Não, Água, etc.)
 */
function analyzeStaticWordSigns(
  landmarks: NormalizedLandmark[],
  handedness: Category
): GestureToken | null {
  const isRightHand = handedness.displayName === "Right";
  const metrics = extractHandMetrics(landmarks, isRightHand);
  if (!metrics) return null;

  const { fingerOpen, scale } = metrics;
  const thumbTip = landmarks[4];
  const pinkyTip = landmarks[20];
  const indexTip = landmarks[8];

  // SIM: Polegar erguido ("joinha"), outros dedos fechados
  if (fingerOpen.thumb && !fingerOpen.index && !fingerOpen.middle && !fingerOpen.ring && !fingerOpen.pinky) {
    // Certifica que o polegar aponta para cima
    if (thumbTip.y < landmarks[2].y) {
      return { type: "WORD", value: "SIM", confidence: 0.94 };
    }
  }

  // NÃO: Indicador levantado em riste com outros fechados
  if (fingerOpen.index && !fingerOpen.middle && !fingerOpen.ring && !fingerOpen.pinky && !fingerOpen.thumb) {
    return { type: "WORD", value: "NAO", confidence: 0.88 };
  }

  // ÁGUA: Mão em formato L no queixo (ou dedo indicador dobrado suavemente)
  if (fingerOpen.thumb && fingerOpen.index && !fingerOpen.middle && !fingerOpen.ring && !fingerOpen.pinky) {
    const thumbIndexSpread = distance3D(thumbTip, indexTip) / scale;
    if (thumbIndexSpread > 0.7 && thumbTip.y > landmarks[0].y - 0.2) {
      return { type: "WORD", value: "AGUA", confidence: 0.85 };
    }
  }

  return null;
}

/**
 * Reconhecimento Completo do Alfabeto Datilológico A-Z em Libras com Geometria 3D
 */
export function analyzeAlphabetSign(
  landmarks: NormalizedLandmark[],
  handedness: Category
): GestureToken | null {
  if (!landmarks || landmarks.length < 21) return null;

  const isRightHand = handedness.displayName === "Right";
  const metrics = extractHandMetrics(landmarks, isRightHand);
  if (!metrics) return null;

  const { fingerOpen, fingerFlexions, scale } = metrics;
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];
  const indexMcp = landmarks[5];

  const { index, middle, ring, pinky, thumb } = fingerOpen;

  // --- LETRA A vs S vs E ---
  if (!index && !middle && !ring && !pinky) {
    // A: Punho fechado, polegar erguido ao lado do indicador
    const thumbUpSide = thumbTip.y < indexMcp.y && Math.abs(thumbTip.x - indexMcp.x) < 0.08;
    if (thumbUpSide) {
      return { type: "LETTER", value: "A", confidence: 0.94 };
    }

    // S: Punho fechado com polegar cruzado horizontalmente sobre os nós dos dedos
    const thumbCrossed = thumbTip.y > indexMcp.y && Math.abs(thumbTip.x - indexMcp.x) < 0.06;
    if (thumbCrossed) {
      return { type: "LETTER", value: "S", confidence: 0.91 };
    }

    // E: Dedos curvados (garras recolhidas)
    if (fingerFlexions.index > 0.65 && fingerFlexions.middle > 0.65) {
      return { type: "LETTER", value: "E", confidence: 0.88 };
    }
  }

  // --- LETRA B ---
  // B: Quatro dedos esticados e unidos, polegar dobrado na palma
  if (index && middle && ring && pinky && !thumb) {
    const fingerSpread = distance2D(indexTip, pinkyTip) / scale;
    if (fingerSpread < 0.75) {
      return { type: "LETTER", value: "B", confidence: 0.95 };
    }
  }

  // --- LETRA C ---
  // C: Todos os dedos curvados formando concha
  if (
    fingerFlexions.index > 0.35 &&
    fingerFlexions.index < 0.75 &&
    fingerFlexions.middle > 0.35 &&
    fingerFlexions.middle < 0.75 &&
    thumb
  ) {
    const tipDist = distance2D(thumbTip, indexTip) / scale;
    if (tipDist > 0.35 && tipDist < 0.75) {
      return { type: "LETTER", value: "C", confidence: 0.86 };
    }
  }

  // --- LETRA D ---
  // D: Apenas indicador apontado para cima, outros formam círculo com polegar
  if (index && !middle && !ring && !pinky) {
    const thumbMiddleDist = distance3D(thumbTip, middleTip) / scale;
    if (thumbMiddleDist < 0.35) {
      return { type: "LETTER", value: "D", confidence: 0.93 };
    }
  }

  // --- LETRA L ---
  // L: Polegar e indicador abertos a 90 graus
  if (thumb && index && !middle && !ring && !pinky) {
    const angleDist = distance2D(thumbTip, indexTip) / scale;
    if (angleDist > 0.65) {
      return { type: "LETTER", value: "L", confidence: 0.96 };
    }
  }

  // --- LETRA I ---
  // I: Apenas dedo mindinho erguido, polegar recolhido
  if (!index && !middle && !ring && pinky && !thumb) {
    const thumbPinkyDist = distance2D(thumbTip, pinkyTip) / scale;
    if (thumbPinkyDist < 0.8) {
      return { type: "LETTER", value: "I", confidence: 0.94 };
    }
  }

  // --- LETRA Y ---
  // Y: Polegar e mindinho abertos (Hang loose)
  if (thumb && !index && !middle && !ring && pinky) {
    const thumbPinkySpread = distance2D(thumbTip, pinkyTip) / scale;
    if (thumbPinkySpread > 0.85) {
      return { type: "LETTER", value: "Y", confidence: 0.95 };
    }
  }

  // --- LETRA U vs V vs W ---
  if (index && middle && !ring && !pinky) {
    const tipDist = distance2D(indexTip, middleTip) / scale;
    // U: Indicador e médio unidos e paralelos
    if (tipDist < 0.22) {
      return { type: "LETTER", value: "U", confidence: 0.92 };
    }
    // V: Indicador e médio separados
    if (tipDist >= 0.25) {
      return { type: "LETTER", value: "V", confidence: 0.93 };
    }
  }

  // W: Indicador, médio e anelar erguidos
  if (index && middle && ring && !pinky && !thumb) {
    return { type: "LETTER", value: "W", confidence: 0.94 };
  }

  // --- LETRA R ---
  // R: Dedos indicador e médio cruzados (figas)
  if (index && middle && !ring && !pinky) {
    const isCrossed = isRightHand
      ? middleTip.x < indexTip.x
      : middleTip.x > indexTip.x;
    if (isCrossed) {
      return { type: "LETTER", value: "R", confidence: 0.89 };
    }
  }

  // --- LETRA F vs T vs O ---
  // Três dedos erguidos (médio, anelar, mindinho)
  if (middle && ring && pinky) {
    const thumbIndexTipDist = distance3D(thumbTip, indexTip) / scale;
    const indexPip = landmarks[6];
    const thumbIndexPipDist = distance3D(thumbTip, indexPip) / scale;

    // F: Polegar encostado por FORA do indicador
    if (thumbIndexTipDist < 0.28 && thumbIndexPipDist > 0.22) {
      return { type: "LETTER", value: "F", confidence: 0.90 };
    }

    // T: Polegar por DENTRO do indicador
    if (thumbIndexPipDist < 0.24) {
      return { type: "LETTER", value: "T", confidence: 0.88 };
    }
  }

  // --- LETRA O ---
  // O: Todos os dedos tocam o polegar formando círculo oval
  const allTipsCloseToThumb =
    distance3D(thumbTip, indexTip) / scale < 0.32 &&
    distance3D(thumbTip, middleTip) / scale < 0.35 &&
    distance3D(thumbTip, ringTip) / scale < 0.38 &&
    distance3D(thumbTip, pinkyTip) / scale < 0.42;

  if (allTipsCloseToThumb && !index && !middle && !ring && !pinky) {
    return { type: "LETTER", value: "O", confidence: 0.91 };
  }

  // --- LETRA M vs N ---
  // M: 3 dedos apontando para baixo
  if (indexTip.y > indexMcp.y && middleTip.y > landmarks[9].y && ringTip.y > landmarks[13].y) {
    return { type: "LETTER", value: "M", confidence: 0.85 };
  }
  // N: 2 dedos apontando para baixo
  if (indexTip.y > indexMcp.y && middleTip.y > landmarks[9].y && ringTip.y <= landmarks[13].y) {
    return { type: "LETTER", value: "N", confidence: 0.86 };
  }

  // --- LETRA X ---
  // X: Indicador em gancho
  if (fingerFlexions.index > 0.45 && fingerFlexions.index < 0.80 && !middle && !ring && !pinky) {
    return { type: "LETTER", value: "X", confidence: 0.84 };
  }

  return null;
}

/**
 * Análise de Movimento Dinâmico com Histórico Temporal (Oi, Z, etc.)
 */
export function analyzeMotionGesture(
  history: NormalizedLandmark[][],
  handedness?: Category
): GestureToken | null {
  if (!history || history.length < 12) return null;

  const n = history.length;
  const wristIdx = 0;
  const indexTipIdx = 8;

  const first = history[n - 12];
  const mid = history[n - 6];
  const last = history[n - 1];

  const dx1 = mid[wristIdx].x - first[wristIdx].x;
  const dx2 = last[wristIdx].x - mid[wristIdx].x;
  const dyTotal = last[wristIdx].y - first[wristIdx].y;

  // Gesto: "OI" (Aceno lateral de mão)
  const changedDirection = (dx1 > 0 && dx2 < 0) || (dx1 < 0 && dx2 > 0);
  const amplitude = Math.abs(dx1) + Math.abs(dx2);

  if (changedDirection && amplitude > 0.16 && Math.abs(dyTotal) < 0.1) {
    return { type: "WORD", value: "OI", confidence: clamp(amplitude, 0.7, 0.98) };
  }

  // Gesto: "Z" (Movimento em zigue-zague com o indicador)
  if (n >= 18) {
    const start = history[n - 18];
    const q1 = history[n - 13];
    const q2 = history[n - 8];
    const end = last;

    const z_dx1 = q1[indexTipIdx].x - start[indexTipIdx].x;
    const z_dx2 = q2[indexTipIdx].x - q1[indexTipIdx].x;
    const z_dy = end[indexTipIdx].y - start[indexTipIdx].y;

    if (z_dx1 > 0.07 && z_dx2 < -0.07 && z_dy > 0.08) {
      return { type: "LETTER", value: "Z", confidence: 0.88 };
    }
  }

  return null;
}