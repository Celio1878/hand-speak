import type { Category, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { distance3D, extractHandMetrics } from "./libras-geometry";

export type NumberToken = {
  type: "NUMBER";
  value: number; // 0-10
  confidence: number; // 0..1
};

export function analyzeNumberSign(
  landmarks: NormalizedLandmark[],
  handedness: Category
): NumberToken | null {
  if (!landmarks || landmarks.length < 21) return null;

  const isRightHand = handedness.displayName === "Right";
  const metrics = extractHandMetrics(landmarks, isRightHand);
  if (!metrics) return null;

  const { fingerOpen, scale } = metrics;
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const pinkyTip = landmarks[20];

  const { index, middle, ring, pinky, thumb } = fingerOpen;

  // 1: Apenas indicador levantado, polegar fechado
  if (index && !middle && !ring && !pinky && !thumb) {
    return { type: "NUMBER", value: 1, confidence: 0.95 };
  }

  // 2: Indicador e médio levantados, polegar fechado
  if (index && middle && !ring && !pinky && !thumb) {
    return { type: "NUMBER", value: 2, confidence: 0.93 };
  }

  // 3: Indicador, médio e anelar levantados OU polegar + indicador + médio
  if (index && middle && ring && !pinky && !thumb) {
    return { type: "NUMBER", value: 3, confidence: 0.92 };
  }
  if (thumb && index && middle && !ring && !pinky) {
    return { type: "NUMBER", value: 3, confidence: 0.90 };
  }

  // 4: Quatro dedos levantados, polegar recolhido
  if (index && middle && ring && pinky && !thumb) {
    return { type: "NUMBER", value: 4, confidence: 0.95 };
  }

  // 5: Todos os 5 dedos abertos e espalhados
  if (index && middle && ring && pinky && thumb) {
    return { type: "NUMBER", value: 5, confidence: 0.96 };
  }

  // 6: Polegar tocando ponta do mindinho
  const thumbPinkyDist = distance3D(thumbTip, pinkyTip) / scale;
  if (thumbPinkyDist < 0.28 && (index || middle || ring)) {
    return { type: "NUMBER", value: 6, confidence: 0.88 };
  }

  // 7: Indicador e polegar abertos a 90 graus (outros fechados)
  if (thumb && index && !middle && !ring && !pinky) {
    return { type: "NUMBER", value: 7, confidence: 0.89 };
  }

  // 8: Polegar tocando dedo médio formando círculo
  const thumbMiddleDist = distance3D(thumbTip, middleTip) / scale;
  if (thumbMiddleDist < 0.26 && index && ring && pinky) {
    return { type: "NUMBER", value: 8, confidence: 0.87 };
  }

  // 9: Polegar tocando indicador formando círculo
  const thumbIndexDist = distance3D(thumbTip, indexTip) / scale;
  if (thumbIndexDist < 0.26 && middle && ring && pinky) {
    return { type: "NUMBER", value: 9, confidence: 0.88 };
  }

  // 0: Todos os dedos dobrados tocando o polegar formando um O
  if (
    thumbIndexDist < 0.25 &&
    thumbMiddleDist < 0.30 &&
    !index &&
    !middle &&
    !ring &&
    !pinky
  ) {
    return { type: "NUMBER", value: 0, confidence: 0.90 };
  }

  return null;
}

export function combineNumberSequence(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return numbers[0];
  return parseInt(numbers.join(""), 10);
}
