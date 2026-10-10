export const MAX_AI_INPUT_LENGTH = 400;

// Padrões conhecidos de prompt injection, jailbreak e sequestro de instruções (sem acentos para correspondência normalizada)
const INJECTION_PATTERNS: RegExp[] = [
  // Tentativas clássicas de cancelamento de instruções anteriores
  /\b(ignore|ignorar)\s+(?:all\s+)?(?:previous\s+|prior\s+|above\s+)?(instructions|rules|prompts|commands|guidelines)\b/i,
  /\b(desconsidere|desconsiderar|esqueca|esquecer|esquece|ignore|ignorar)\s+(?:todas\s+)?(?:as\s+)?(instrucoes|regras|diretrizes|comandos)\s*(anteriores)?\b/i,

  // Tentativas de impersonação, jailbreak explícito ou troca de persona
  /\bjailbreak\b/i,
  /\b(dan\s+mode|modo\s+dan)\b/i,
  /\b(you\s+are\s+now|act\s+as|voce\s+agora\s+e|aja\s+como)\s+(an?\s+|o\s+|uma?\s+)?(unrestricted|dan|developer|god|jailbreak|evil|hacked|modo\s+desenvolvedor|ia\s+sem\s+filtros|unfiltered|hacker)\b/i,

  // Tentativas de extração de segredos, system prompt ou chaves
  /\b(reveal|print|show|output|leak|display)\s+(your\s+)?(system\s+prompt|instructions|api\s*key|secret|token|env|credentials)\b/i,
  /\b(revele|mostre|imprima|exiba|diga)\s+(seu\s+)?(prompt|instrucoes\s+de\s+sistema|chave|token|segredo|api\s*key)\b/i,
  /process\.env/i,
  /GEMINI_API_KEY/i,

  // Tentativas de injeção de código executável ou scripts
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /\b(eval|exec|Function)\s*\(/i,
];

/**
 * Remove acentos e normaliza string para análise de segurança
 */
function normalizeForSecurity(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Avalia se o texto fornecido contém tentativas de Prompt Injection ou Jailbreak
 */
export function detectPromptInjection(input: string): {
  isInjection: boolean;
  matchedPattern?: string;
} {
  if (!input || typeof input !== "string") {
    return { isInjection: false };
  }

  // Normaliza removendo acentos para evitar bypass por variação de diacríticos
  const normalized = normalizeForSecurity(input);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isInjection: true,
        matchedPattern: pattern.source,
      };
    }
  }

  return { isInjection: false };
}

// Armazenamento em memória para controle de taxa (Rate Limiting)
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Controle de Taxa em Janela Deslizante (Rate Limiting)
 * Por padrão: 30 requisições a cada 60 segundos por identificador (IP ou sessão)
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 30,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier) || { timestamps: [] };

  // Remove timestamps mais antigos que a janela
  const validTimestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    rateLimitStore.set(identifier, { timestamps: validTimestamps });
    return { allowed: false, remaining: 0 };
  }

  validTimestamps.push(now);
  rateLimitStore.set(identifier, {
    timestamps: validTimestamps,
  });

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
  };
}

// Padrões de segredos para redação imediata
const SECRET_LEAKAGE_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/g, // Google API Key format
  /Bearer\s+[A-Za-z0-9-_.]+/gi,
  /sk-[A-Za-z0-9-_]{20,}/g,
  /GEMINI_API_KEY\s*[:=]\s*[^\s]+/gi,
];

// Padrões de meta-diálogos não solicitados da IA
const META_AI_TALK_PATTERNS = [
  /^como\s+uma?\s+(inteligência\s+artificial|modelo\s+de\s+ia|ia)[\s\S]*?[,.]\s*/i,
  /^aqui\s+está\s+a\s+(sua\s+)?tradução[\s\S]*?:\s*/i,
  /^certamente![\s\S]*?:\s*/i,
  /^claro![\s\S]*?:\s*/i,
];

/**
 * Escudo de Saída (Output Guardrail)
 * Redige segredos acidentais, remove scripts XSS e suprime meta-conversas da IA
 */
export function sanitizeAiOutput(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";

  let cleaned = rawText.trim();

  // 1. Redação de Segredos e Chaves
  for (const secretRegex of SECRET_LEAKAGE_PATTERNS) {
    cleaned = cleaned.replace(secretRegex, "[DADO_CONFIDENCIAL_REMOVIDO]");
  }

  // 2. Remoção de Meta-Conversas da IA
  for (const metaRegex of META_AI_TALK_PATTERNS) {
    cleaned = cleaned.replace(metaRegex, "");
  }

  // 3. Sanitização contra injeções de HTML / Scripts (XSS)
  cleaned = cleaned
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/javascript:/gi, "");

  return cleaned.trim();
}

/**
 * Escapa a entrada do usuário para ser inserida com segurança dentro de tags XML no prompt
 */
export function escapePromptXml(text: string): string {
  if (!text) return "";
  return text
    .slice(0, MAX_AI_INPUT_LENGTH)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
