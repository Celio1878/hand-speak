import {
  getCustomApiKey,
  getSelectedModel,
  getSelectedTone,
  useCredit,
} from "./freemium-service";
import type { GeminiRefineResponse } from "~/routes/api.gemini";
import { MAX_AI_INPUT_LENGTH, sanitizeAiOutput } from "./ai-guardrails";

export type RefineOptions = {
  tone?: "casual" | "formal" | "emergency";
  model?: string;
  onOutOfCredits?: () => void;
};

/**
 * Higieniza o texto natural extraído, removendo qualquer resíduo de chaves JSON,
 * tags de propriedade (ex: "naturalPortuguese":) ou aspas periféricas.
 */
export function sanitizeNaturalPortuguese(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  let text = raw.trim();

  // 1. Tenta parse se a string contiver um JSON serializado
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && typeof obj.naturalPortuguese === "string") {
      text = obj.naturalPortuguese;
    }
  } catch {
    // Continua para extração regex
  }

  // 2. Extrai valor de "naturalPortuguese": "conteúdo" mesmo se truncado sem a chave de fechamento }
  const keyMatch = text.match(/"naturalPortuguese"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"?/);
  if (keyMatch && keyMatch[1]) {
    text = keyMatch[1];
  }

  // 3. Remove blocos markdown ```json ... ``` ou ``` ... ```
  text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");

  // 4. Remove chaves soltas, prefixos de propriedade e aspas periféricas
  text = text.replace(/^\s*\{\s*/, "").replace(/\s*\}\s*$/, "");
  text = text.replace(/^"naturalPortuguese"\s*:\s*"?/, "");
  text = text.replace(/^["'\s]+|["'\s]+$/g, "");

  return text.trim();
}

export async function refineWithGemini(
  text: string,
  options?: RefineOptions
): Promise<GeminiRefineResponse & { outOfCredits?: boolean }> {
  if (!text.trim()) {
    return { success: false, naturalPortuguese: "" };
  }

  const safeInput = text.slice(0, MAX_AI_INPUT_LENGTH).trim();

  // Check and consume quota
  const hasCredit = useCredit();
  if (!hasCredit) {
    if (options?.onOutOfCredits) options.onOutOfCredits();
    return {
      success: false,
      outOfCredits: true,
      naturalPortuguese: sanitizeAiOutput(sanitizeNaturalPortuguese(safeInput)),
      error: "Cota diária gratuita esgotada. Assine o plano Pro para continuar traduzindo com IA ilimitada.",
    };
  }

  const tone = options?.tone || getSelectedTone();
  const model = options?.model || getSelectedModel();
  const customApiKey = getCustomApiKey();

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "refine",
        text: safeInput,
        tone,
        model,
        customApiKey,
      }),
    });

    const data: GeminiRefineResponse = await res.json();
    if (data.naturalPortuguese) {
      data.naturalPortuguese = sanitizeAiOutput(sanitizeNaturalPortuguese(data.naturalPortuguese));
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha na requisição";
    return {
      success: false,
      naturalPortuguese: sanitizeAiOutput(sanitizeNaturalPortuguese(safeInput)),
      fallback: true,
      error: msg,
    };
  }
}

export async function reverseTranslateToLibras(
  spokenText: string
): Promise<GeminiRefineResponse> {
  if (!spokenText.trim()) {
    return { success: false, librasGlosses: [] };
  }

  const safeInput = spokenText.slice(0, MAX_AI_INPUT_LENGTH).trim();
  const model = getSelectedModel();
  const customApiKey = getCustomApiKey();

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "reverse",
        text: safeInput,
        model,
        customApiKey,
      }),
    });

    const data: GeminiRefineResponse = await res.json();
    if (data.naturalPortuguese) {
      data.naturalPortuguese = sanitizeAiOutput(sanitizeNaturalPortuguese(data.naturalPortuguese));
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha na tradução reversa";
    return {
      success: false,
      naturalPortuguese: sanitizeAiOutput(sanitizeNaturalPortuguese(safeInput)),
      librasGlosses: safeInput.toUpperCase().split(" "),
      fallback: true,
      error: msg,
    };
  }
}

export async function transcribeAudioWithGemini(
  audioBlob: Blob,
  options?: { onOutOfCredits?: () => void }
): Promise<GeminiRefineResponse & { outOfCredits?: boolean }> {
  if (!audioBlob || audioBlob.size === 0) {
    return { success: false, error: "Nenhum áudio fornecido." };
  }

  // Verifica e consome 1 crédito Freemium
  const hasCredit = useCredit();
  if (!hasCredit) {
    if (options?.onOutOfCredits) options.onOutOfCredits();
    return {
      success: false,
      outOfCredits: true,
      error: "Cota diária gratuita esgotada. Assine o plano Pro para continuar traduzindo com IA ilimitada.",
    };
  }

  const model = getSelectedModel();
  const customApiKey = getCustomApiKey();

  // Converte Blob para base64
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);
  const audioMimeType = audioBlob.type || "audio/webm";

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "audio",
        audioBase64,
        audioMimeType,
        model,
        customApiKey,
      }),
    });

    const data: GeminiRefineResponse = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha na transcrição de áudio";
    return {
      success: false,
      fallback: true,
      error: msg,
    };
  }
}

