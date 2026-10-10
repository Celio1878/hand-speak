import { FREQUENT_PORTUGUESE_WORDS } from "./portuguese-dictionary";

// Matriz de confusão geométrica de Libras com custos de transição ponderados
const LIBRAS_CONFUSION_PAIRS: Record<string, number> = {
  // A vs S: colisão clássica do punho fechado (polegar ao lado vs sobre os dedos)
  "A-S": 0.2,
  "S-A": 0.2,

  // F vs T: colisão crítica do polegar por fora vs por dentro do indicador
  "F-T": 0.18,
  "T-F": 0.18,

  // U vs V: indicador e médio juntos vs separados
  "U-V": 0.18,
  "V-U": 0.18,

  // M vs N: 3 dedos vs 2 dedos para baixo
  "M-N": 0.22,
  "N-M": 0.22,

  // G vs Q: indicador e polegar para cima vs para baixo
  "G-Q": 0.25,
  "Q-G": 0.25,

  // K vs P vs H: configuração idêntica com rotação de pulso
  "K-P": 0.25,
  "P-K": 0.25,
  "K-H": 0.28,
  "H-K": 0.28,

  // O vs C: dedos em círculo vs arco aberto
  "O-C": 0.25,
  "C-O": 0.25,

  // E vs C: garra compacta vs arco aberto
  "E-C": 0.28,
  "C-E": 0.28,

  // D vs 1: indicador para cima com ou sem toque do polegar
  "D-1": 0.2,
  "1-D": 0.2,
};

// Dicionário expandido de alta frequência em Português
const EXPANDED_PORTUGUESE_WORDS: string[] = Array.from(
  new Set([
    ...FREQUENT_PORTUGUESE_WORDS,
    "FAZER",
    "FAZENDO",
    "FEZ",
    "QUERER",
    "QUERO",
    "PRECISO",
    "ESTOU",
    "ESTAR",
    "MUITO",
    "POUCO",
    "BEM",
    "MAL",
    "BOM",
    "BOA",
    "TEMPO",
    "HOJE",
    "AMANHÃ",
    "ONTEM",
    "AGORA",
    "DEPOIS",
    "TUDO",
    "NADA",
    "SIM",
    "NÃO",
    "VOCÊ",
    "VOCES",
    "ELE",
    "ELA",
    "ELES",
    "ELAS",
    "NOS",
    "MEU",
    "MINHA",
    "SEU",
    "SUA",
    "AQUI",
    "ALI",
    "LÁ",
    "ONDE",
    "COMO",
    "QUEM",
    "QUANDO",
    "PORQUE",
    "VER",
    "OLHAR",
    "FALAR",
    "DIZER",
    "OUVIR",
    "SENTIR",
    "SABER",
    "CONHECER",
    "GOSTAR",
    "AMAR",
    "TRABALHO",
    "ESCOLA",
    "CURSO",
    "CASA",
    "RUA",
    "CIDADE",
    "BRASIL",
    "LIBRAS",
    "SURDO",
    "OUVINTE",
    "MUDO",
    "AMIGO",
    "AMIGA",
    "FAMILIA",
    "PAI",
    "MÃE",
    "FILHO",
    "FILHA",
    "IRMÃO",
    "IRMÃ",
    "MÉDICO",
    "HOSPITAL",
    "REMÉDIO",
    "DOR",
    "SAÚDE",
    "AJUDA",
    "SOCORRO",
    "POLÍCIA",
    "BOMBEIRO",
    "ÁGUA",
    "COMIDA",
    "PÃO",
    "CAFÉ",
    "LEITE",
    "ALMOÇO",
    "JANTAR",
    "UM",
    "DOIS",
    "TRÊS",
    "QUATRO",
    "CINCO",
    "DEZ",
  ])
);

// Normalizador de acentuação para busca uniforme
function normalizeString(str: string): string {
  return str
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Mapa de busca rápido (chave normalizada -> palavra original com acentos)
const NORMALIZED_WORD_MAP = new Map<string, string>();
for (const word of EXPANDED_PORTUGUESE_WORDS) {
  const norm = normalizeString(word);
  if (!NORMALIZED_WORD_MAP.has(norm)) {
    NORMALIZED_WORD_MAP.set(norm, word);
  }
}

/**
 * Calcula a distância de Levenshtein ponderada por pares fonológicos de Libras
 */
export function getLibrasWeightedDistance(source: string, target: string): number {
  const s = normalizeString(source);
  const t = normalizeString(target);

  const m = s.length;
  const n = t.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Matriz DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i * 0.9;
  for (let j = 0; j <= n; j++) dp[0][j] = j * 0.9;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const charS = s[i - 1];
      const charT = t[j - 1];

      if (charS === charT) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        // Custo ponderado de substituição se for par de colisão de Libras
        const pairKey = `${charS}-${charT}`;
        const subCost = LIBRAS_CONFUSION_PAIRS[pairKey] ?? 1.0;

        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + subCost, // Substituição ponderada
          dp[i - 1][j] + 0.9,         // Deleção
          dp[i][j - 1] + 0.9          // Inserção
        );
      }
    }
  }

  return dp[m][n];
}

export type AutoCorrectionResult = {
  originalWord: string;
  correctedWord: string;
  wasCorrected: boolean;
  confidenceScore: number;
  reason?: string;
};

/**
 * Desambigua e corrige automaticamente a palavra do buffer de Libras (<5ms local)
 */
export function autoCorrectBufferWord(
  rawWord: string,
  _previousContext: string = ""
): AutoCorrectionResult {
  if (!rawWord || rawWord.trim().length === 0) {
    return {
      originalWord: rawWord,
      correctedWord: rawWord,
      wasCorrected: false,
      confidenceScore: 1.0,
    };
  }

  const cleanWord = rawWord.trim().toUpperCase();
  const normalizedInput = normalizeString(cleanWord);

  // 1. Se a palavra já for exatamente uma palavra válida de alta frequência, mantemos intacta
  if (NORMALIZED_WORD_MAP.has(normalizedInput)) {
    const originalCanonical = NORMALIZED_WORD_MAP.get(normalizedInput)!;
    // Se a palavra difere apenas em acentuação, normalizamos para a canônica
    const needsAccent = originalCanonical !== cleanWord;
    return {
      originalWord: cleanWord,
      correctedWord: needsAccent ? originalCanonical : cleanWord,
      wasCorrected: needsAccent,
      confidenceScore: 0.98,
      reason: needsAccent ? "Acentuação ajustada" : undefined,
    };
  }

  // Se a palavra tiver menos de 2 caracteres e não estiver no mapa, não substitui cegamente
  if (cleanWord.length < 2) {
    return {
      originalWord: cleanWord,
      correctedWord: cleanWord,
      wasCorrected: false,
      confidenceScore: 0.5,
    };
  }

  // 2. Busca o candidato mais próximo no dicionário com base na distância de Libras
  let bestCandidate: string | null = null;
  let minDistance = Infinity;

  // Tolerância máxima baseada no tamanho da palavra
  const maxThreshold = cleanWord.length <= 3 ? 0.75 : cleanWord.length <= 6 ? 1.35 : 1.8;

  for (const [normTarget, canonicalWord] of NORMALIZED_WORD_MAP.entries()) {
    // Poda rápida de comprimento
    if (Math.abs(normTarget.length - normalizedInput.length) > 2) continue;

    const dist = getLibrasWeightedDistance(normalizedInput, normTarget);
    if (dist < minDistance) {
      minDistance = dist;
      bestCandidate = canonicalWord;
    }
  }

  // 3. Avalia se o melhor candidato satisfaz o limiar de autocorreção
  if (bestCandidate && minDistance <= maxThreshold) {
    return {
      originalWord: cleanWord,
      correctedWord: bestCandidate,
      wasCorrected: true,
      confidenceScore: Math.max(0.65, 1.0 - minDistance / 2.0),
      reason: `Corrigido via desambiguação de Libras (distância: ${minDistance.toFixed(2)})`,
    };
  }

  // Nenhuma correção satisfatória encontrada, mantém original
  return {
    originalWord: cleanWord,
    correctedWord: cleanWord,
    wasCorrected: false,
    confidenceScore: 0.4,
  };
}
