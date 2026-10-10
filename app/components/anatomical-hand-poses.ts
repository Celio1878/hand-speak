export type Point3D = {
  x: number;
  y: number;
  z: number;
};

export type HandPose3D = {
  id: string;
  label: string;
  category: "ALPHABET" | "NUMBER" | "WORD";
  landmarks: Point3D[];
  activeJointsFocus?: number[]; // Índices dos nós articulares com maior destaque
  anatomicalTip: string;
  durationMs?: number;
};

// 21 nós articulares da topologia da mão
// 0: Pulso (Wrist)
// 1-4: Polegar (CMC, MCP, IP, Ponta)
// 5-8: Indicador (MCP, PIP, DIP, Ponta)
// 9-12: Médio (MCP, PIP, DIP, Ponta)
// 13-16: Anelar (MCP, PIP, DIP, Ponta)
// 17-20: Mínimo (MCP, PIP, DIP, Ponta)

export const HAND_CONNECTIONS: [number, number][] = [
  // Polegar
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Indicador
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Médio
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Anelar
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Mínimo
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Base dos metacarpos da palma
  [5, 9], [9, 13], [13, 17]
];

// Helper para construir poses anatômicas paramétricas
// A mão é modelada com origem no pulso [0, -1.2, 0] e dedos apontando para cima
function createHandSkeleton(config: {
  thumb: "OPEN" | "CLOSED" | "OUTSIDE" | "INSIDE" | "PARALLEL" | "HALF";
  index: "OPEN" | "CLOSED" | "HOOK" | "BENT_BASE";
  middle: "OPEN" | "CLOSED" | "HOOK" | "BENT_BASE";
  ring: "OPEN" | "CLOSED" | "HOOK";
  pinky: "OPEN" | "CLOSED" | "HOOK";
  wristAngleY?: number; // Rotação do pulso
  wristAngleZ?: number; // Inclinação lateral
  spread?: number; // Abertura dos dedos
}): Point3D[] {
  const spread = config.spread ?? 1;
  const pts: Point3D[] = new Array(21);

  // 0: Pulso
  pts[0] = { x: 0, y: -1.2, z: 0 };

  // Metacarpos das bases dos dedos (MCPs)
  pts[5] = { x: -0.45 * spread, y: -0.2, z: 0.05 }; // Index MCP
  pts[9] = { x: -0.15 * spread, y: -0.1, z: 0.05 }; // Middle MCP
  pts[13] = { x: 0.18 * spread, y: -0.15, z: 0.03 }; // Ring MCP
  pts[17] = { x: 0.45 * spread, y: -0.25, z: 0 };   // Pinky MCP

  // 1-4: Polegar
  pts[1] = { x: -0.3, y: -0.85, z: 0.15 }; // Thumb CMC
  pts[2] = { x: -0.6, y: -0.6, z: 0.3 };  // Thumb MCP

  if (config.thumb === "OPEN") {
    pts[3] = { x: -0.85, y: -0.35, z: 0.4 };
    pts[4] = { x: -1.1, y: -0.15, z: 0.45 };
  } else if (config.thumb === "OUTSIDE") {
    // Letra F: polegar repousa pelo lado de fora do indicador
    pts[3] = { x: -0.55, y: -0.15, z: 0.45 };
    pts[4] = { x: -0.45, y: 0.05, z: 0.5 };
  } else if (config.thumb === "INSIDE") {
    // Letra T: polegar inserido por dentro do indicador
    pts[3] = { x: -0.35, y: -0.25, z: 0.1 };
    pts[4] = { x: -0.25, y: -0.05, z: 0.1 };
  } else if (config.thumb === "PARALLEL") {
    // Letra G: paralelo ao indicador
    pts[3] = { x: -0.45, y: -0.1, z: 0.35 };
    pts[4] = { x: -0.45, y: 0.35, z: 0.35 };
  } else if (config.thumb === "HALF") {
    // Semi-aberto
    pts[3] = { x: -0.5, y: -0.35, z: 0.35 };
    pts[4] = { x: -0.5, y: -0.1, z: 0.4 };
  } else {
    // CLOSED: dobrado sobre a palma ou punho
    pts[3] = { x: -0.25, y: -0.4, z: 0.35 };
    pts[4] = { x: 0.0, y: -0.35, z: 0.35 };
  }

  // Função auxiliar para calcular articulações de um dedo
  function setFinger(
    mcpIdx: number,
    baseX: number,
    state: "OPEN" | "CLOSED" | "HOOK" | "BENT_BASE",
    lengthScale: number = 1
  ) {
    const base = pts[mcpIdx];
    if (state === "OPEN") {
      pts[mcpIdx + 1] = { x: base.x + baseX * 0.1, y: base.y + 0.38 * lengthScale, z: base.z };
      pts[mcpIdx + 2] = { x: base.x + baseX * 0.15, y: base.y + 0.72 * lengthScale, z: base.z - 0.02 };
      pts[mcpIdx + 3] = { x: base.x + baseX * 0.2, y: base.y + 1.05 * lengthScale, z: base.z - 0.04 };
    } else if (state === "HOOK") {
      // Meio curvado (como na letra C)
      pts[mcpIdx + 1] = { x: base.x, y: base.y + 0.3 * lengthScale, z: base.z + 0.2 };
      pts[mcpIdx + 2] = { x: base.x, y: base.y + 0.45 * lengthScale, z: base.z + 0.45 };
      pts[mcpIdx + 3] = { x: base.x, y: base.y + 0.3 * lengthScale, z: base.z + 0.6 };
    } else if (state === "BENT_BASE") {
      // Dedo flexionado a partir da base (como em F)
      pts[mcpIdx + 1] = { x: base.x, y: base.y + 0.1, z: base.z + 0.3 };
      pts[mcpIdx + 2] = { x: base.x, y: base.y - 0.1, z: base.z + 0.35 };
      pts[mcpIdx + 3] = { x: base.x, y: base.y - 0.25, z: base.z + 0.3 };
    } else {
      // CLOSED: punho fechado
      pts[mcpIdx + 1] = { x: base.x, y: base.y + 0.15 * lengthScale, z: base.z + 0.2 };
      pts[mcpIdx + 2] = { x: base.x, y: base.y - 0.05 * lengthScale, z: base.z + 0.25 };
      pts[mcpIdx + 3] = { x: base.x, y: base.y - 0.22 * lengthScale, z: base.z + 0.18 };
    }
  }

  // Indicador
  setFinger(5, -0.15, config.index, 1.0);
  // Médio
  setFinger(9, 0.0, config.middle, 1.1);
  // Anelar
  setFinger(13, 0.12, config.ring, 0.95);
  // Mínimo
  setFinger(17, 0.25, config.pinky, 0.8);

  // Aplica rotações adicionais de pulso se houver
  if (config.wristAngleY || config.wristAngleZ) {
    const cosY = Math.cos(config.wristAngleY || 0);
    const sinY = Math.sin(config.wristAngleY || 0);
    const cosZ = Math.cos(config.wristAngleZ || 0);
    const sinZ = Math.sin(config.wristAngleZ || 0);

    for (let i = 1; i < pts.length; i++) {
      let { x, y, z } = pts[i];
      // Rot Z
      let x1 = x * cosZ - y * sinZ;
      let y1 = x * sinZ + y * cosZ;
      let z1 = z;
      // Rot Y
      let x2 = x1 * cosY + z1 * sinY;
      let y2 = y1;
      let z2 = -x1 * sinY + z1 * cosY;
      pts[i] = { x: x2, y: y2, z: z2 };
    }
  }

  return pts;
}

// Catálogo completo de Poses Anatômicas 3D de Libras
export const LIBRAS_ANATOMICAL_POSES: Record<string, HandPose3D> = {
  // --- Alfabeto A-Z ---
  A: {
    id: "A",
    label: "Letra A",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "OPEN",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [1, 2, 3, 4],
    anatomicalTip: "Punho fechado com o polegar estendido lateralmente apoiado no indicador.",
  },
  B: {
    id: "B",
    label: "Letra B",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.6,
    }),
    activeJointsFocus: [8, 12, 16, 20],
    anatomicalTip: "Quatro dedos esticados e unidos para cima; polegar dobrado sobre a palma.",
  },
  C: {
    id: "C",
    label: "Letra C",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "HOOK",
      middle: "HOOK",
      ring: "HOOK",
      pinky: "HOOK",
      spread: 0.8,
    }),
    activeJointsFocus: [4, 8, 12, 16, 20],
    anatomicalTip: "Todos os dedos curvados formando o arco característico da letra C.",
  },
  D: {
    id: "D",
    label: "Letra D",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [5, 6, 7, 8],
    anatomicalTip: "Apenas o dedo indicador erguido; os demais tocam o polegar em círculo.",
  },
  E: {
    id: "E",
    label: "Letra E",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "BENT_BASE",
      middle: "BENT_BASE",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [6, 7, 8, 10, 11, 12],
    anatomicalTip: "Dedos flexionados com as pontas apoiadas na base da palma em garra.",
  },
  F: {
    id: "F",
    label: "Letra F",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "OUTSIDE",
      index: "BENT_BASE",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.9,
    }),
    activeJointsFocus: [3, 4, 6, 7],
    anatomicalTip: "Indicador dobrado com o polegar encostado por FORA dele; outros 3 dedos erguidos.",
  },
  G: {
    id: "G",
    label: "Letra G",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "PARALLEL",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [4, 8],
    anatomicalTip: "Indicador apontado para cima com o polegar estendido ao lado dele.",
  },
  H: {
    id: "H",
    label: "Letra H",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: -0.6, // Mão deitada horizontalmente
      spread: 0.7,
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Indicador e médio abertos em V na horizontal com polegar entre eles.",
  },
  I: {
    id: "I",
    label: "Letra I",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "OPEN",
    }),
    activeJointsFocus: [17, 18, 19, 20],
    anatomicalTip: "Apenas o dedo mínimo (mindinho) estendido para cima com o punho fechado.",
  },
  J: {
    id: "J",
    label: "Letra J",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "OPEN",
      wristAngleZ: -0.3,
    }),
    activeJointsFocus: [19, 20],
    anatomicalTip: "Posição da letra I desenhando a curva do J no ar com o mindinho.",
  },
  K: {
    id: "K",
    label: "Letra K",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 0.8,
    }),
    activeJointsFocus: [4, 8, 12],
    anatomicalTip: "Indicador e médio abertos em V para cima com o polegar inserido entre eles.",
  },
  L: {
    id: "L",
    label: "Letra L",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "OPEN",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [4, 8],
    anatomicalTip: "Indicador para cima e polegar aberto a 90 graus formando a letra L exata.",
  },
  M: {
    id: "M",
    label: "Letra M",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "CLOSED",
      wristAngleZ: 3.14, // Dedos virados para baixo
      spread: 0.6,
    }),
    activeJointsFocus: [8, 12, 16],
    anatomicalTip: "Três dedos (indicador, médio e anelar) apontados para baixo.",
  },
  N: {
    id: "N",
    label: "Letra N",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: 3.14, // Dedos virados para baixo
      spread: 0.6,
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Dois dedos (indicador e médio) apontados para baixo.",
  },
  O: {
    id: "O",
    label: "Letra O",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "HOOK",
      middle: "HOOK",
      ring: "HOOK",
      pinky: "HOOK",
      spread: 0.5,
    }),
    activeJointsFocus: [4, 8, 12, 16, 20],
    anatomicalTip: "Todas as pontas dos dedos unidas à ponta do polegar formando um círculo (O).",
  },
  P: {
    id: "P",
    label: "Letra P",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: 1.57, // Mão apontando para o lado/baixo
    }),
    activeJointsFocus: [4, 8, 12],
    anatomicalTip: "Configuração da letra K com a mão inclinada para baixo.",
  },
  Q: {
    id: "Q",
    label: "Letra Q",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "PARALLEL",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: 3.14, // Apontado para baixo
    }),
    activeJointsFocus: [4, 8],
    anatomicalTip: "Indicador e polegar esticados paralelos apontando para o chão.",
  },
  R: {
    id: "R",
    label: "Letra R",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 0.2, // Dedos cruzados
    }),
    activeJointsFocus: [7, 8, 11, 12],
    anatomicalTip: "Dedo médio cruzado sobre o indicador estendido.",
  },
  S: {
    id: "S",
    label: "Letra S",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [2, 3, 4],
    anatomicalTip: "Punho totalmente fechado com o polegar repousando na frente dos dedos.",
  },
  T: {
    id: "T",
    label: "Letra T",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "INSIDE",
      index: "BENT_BASE",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.9,
    }),
    activeJointsFocus: [3, 4, 6],
    anatomicalTip: "Polegar inserido por DENTRO do indicador curvado (diferente da letra F).",
  },
  U: {
    id: "U",
    label: "Letra U",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 0.2, // Dedos juntos
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Indicador e médio esticados juntos e unidos para cima.",
  },
  V: {
    id: "V",
    label: "Letra V",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 1.1, // Dedos abertos em V
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Indicador e médio esticados e separados formando o sinal da vitória / V.",
  },
  W: {
    id: "W",
    label: "Letra W",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "CLOSED",
      spread: 1.0,
    }),
    activeJointsFocus: [8, 12, 16],
    anatomicalTip: "Três dedos (indicador, médio e anelar) estendidos para cima e separados.",
  },
  X: {
    id: "X",
    label: "Letra X",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "HOOK",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [6, 7, 8],
    anatomicalTip: "Indicador dobrado em forma de gancho, puxando em direção ao corpo.",
  },
  Y: {
    id: "Y",
    label: "Letra Y",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "OPEN",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "OPEN",
    }),
    activeJointsFocus: [4, 20],
    anatomicalTip: "Apenas polegar e dedo mínimo estendidos para os lados (sinal do hang loose).",
  },
  Z: {
    id: "Z",
    label: "Letra Z",
    category: "ALPHABET",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [8],
    anatomicalTip: "Indicador estendido desenhando no ar o traçado da letra Z.",
  },

  // --- Números 0-10 ---
  "0": {
    id: "0",
    label: "Número 0",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "HOOK",
      middle: "HOOK",
      ring: "HOOK",
      pinky: "HOOK",
      spread: 0.4,
    }),
    activeJointsFocus: [4, 8, 12, 16, 20],
    anatomicalTip: "Mão em formato de círculo com todas as pontas dos dedos unidas.",
  },
  "1": {
    id: "1",
    label: "Número 1",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
    }),
    activeJointsFocus: [8],
    anatomicalTip: "Apenas o dedo indicador erguido apontando para cima.",
  },
  "2": {
    id: "2",
    label: "Número 2",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 1.0,
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Indicador e dedo médio estendidos para cima.",
  },
  "3": {
    id: "3",
    label: "Número 3",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "CLOSED",
      spread: 0.9,
    }),
    activeJointsFocus: [8, 12, 16],
    anatomicalTip: "Indicador, médio e anelar estendidos para cima.",
  },
  "4": {
    id: "4",
    label: "Número 4",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.7,
    }),
    activeJointsFocus: [8, 12, 16, 20],
    anatomicalTip: "Quatro dedos estendidos para cima com o polegar recolhido na palma.",
  },
  "5": {
    id: "5",
    label: "Número 5",
    category: "NUMBER",
    landmarks: createHandSkeleton({
      thumb: "OPEN",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 1.2,
    }),
    activeJointsFocus: [4, 8, 12, 16, 20],
    anatomicalTip: "Mão totalmente aberta com os cinco dedos estendidos.",
  },

  // --- Expressões e Sinais Frequentes ---
  OI: {
    id: "OI",
    label: "Sinal: Oi / Olá",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "OPEN",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 1.1,
      wristAngleZ: 0.2,
    }),
    activeJointsFocus: [4, 8, 12, 16, 20],
    anatomicalTip: "Mão aberta balançando lateralmente na altura do rosto em cumprimento.",
    durationMs: 1400,
  },
  OBRIGADO: {
    id: "OBRIGADO",
    label: "Sinal: Obrigado",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.5,
      wristAngleY: 0.4,
    }),
    activeJointsFocus: [0, 8, 12],
    anatomicalTip: "Mão espalmada tocando a testa e o queixo e projetando-se suavemente para a frente.",
    durationMs: 1500,
  },
  AMIGO: {
    id: "AMIGO",
    label: "Sinal: Amigo",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "HALF",
      index: "HOOK",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 0.6,
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Indicadores em gancho entrelaçando-se na altura do peito.",
    durationMs: 1300,
  },
  FAMILIA: {
    id: "FAMILIA",
    label: "Sinal: Família",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "OUTSIDE",
      index: "BENT_BASE",
      middle: "OPEN",
      ring: "OPEN",
      pinky: "OPEN",
      spread: 0.9,
    }),
    activeJointsFocus: [4, 8, 20],
    anatomicalTip: "Configuração em F com ambas as mãos fazendo um movimento circular e unindo os mindinhos.",
    durationMs: 1600,
  },
  PAZ: {
    id: "PAZ",
    label: "Sinal: Paz",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "OPEN",
      ring: "CLOSED",
      pinky: "CLOSED",
      spread: 1.2,
    }),
    activeJointsFocus: [8, 12],
    anatomicalTip: "Configuração em V (palma para a frente) descendo suavemente.",
    durationMs: 1200,
  },
  SIM: {
    id: "SIM",
    label: "Sinal: Sim",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "CLOSED",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: 0.3,
    }),
    activeJointsFocus: [0, 9],
    anatomicalTip: "Punho fechado em configuração S balançando verticalmente como a cabeça.",
    durationMs: 1100,
  },
  NAO: {
    id: "NAO",
    label: "Sinal: Não",
    category: "WORD",
    landmarks: createHandSkeleton({
      thumb: "CLOSED",
      index: "OPEN",
      middle: "CLOSED",
      ring: "CLOSED",
      pinky: "CLOSED",
      wristAngleZ: 0.4,
    }),
    activeJointsFocus: [5, 8],
    anatomicalTip: "Indicador estendido oscilando de um lado para o outro.",
    durationMs: 1100,
  },
};

// Interpolação geométrica suave de poses 3D (Lerp com curva suave)
export function interpolateHandPoses(
  fromPose: Point3D[],
  toPose: Point3D[],
  t: number
): Point3D[] {
  // Smoothstep easing: t * t * (3 - 2 * t)
  const clamped = Math.max(0, Math.min(1, t));
  const ease = clamped * clamped * (3 - 2 * clamped);

  const result: Point3D[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    const p1 = fromPose[i] || { x: 0, y: 0, z: 0 };
    const p2 = toPose[i] || { x: 0, y: 0, z: 0 };
    result[i] = {
      x: p1.x + (p2.x - p1.x) * ease,
      y: p1.y + (p2.y - p1.y) * ease,
      z: p1.z + (p2.z - p1.z) * ease,
    };
  }
  return result;
}

// Converte texto em sequência de poses de Libras
export function resolveTextToPoseSequence(text: string): HandPose3D[] {
  const normalized = text.trim().toUpperCase();
  const words = normalized.split(/\s+/);
  const sequence: HandPose3D[] = [];

  for (const word of words) {
    if (!word) continue;
    // Se a palavra inteira possui um sinal direto (ex: OI, OBRIGADO, PAZ)
    if (LIBRAS_ANATOMICAL_POSES[word]) {
      sequence.push(LIBRAS_ANATOMICAL_POSES[word]);
    } else {
      // Soletrar letra a letra
      for (const char of word) {
        if (LIBRAS_ANATOMICAL_POSES[char]) {
          sequence.push(LIBRAS_ANATOMICAL_POSES[char]);
        }
      }
    }
  }

  return sequence.length > 0 ? sequence : [LIBRAS_ANATOMICAL_POSES["A"]];
}
