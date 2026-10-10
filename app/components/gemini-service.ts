import {
  getCustomApiKey,
  getSelectedModel,
  getSelectedTone,
  useCredit,
} from "./freemium-service";
import type { GeminiRefineResponse } from "~/routes/api.gemini";

export type RefineOptions = {
  tone?: "casual" | "formal" | "emergency";
  model?: string;
  onOutOfCredits?: () => void;
};

export async function refineWithGemini(
  text: string,
  options?: RefineOptions
): Promise<GeminiRefineResponse & { outOfCredits?: boolean }> {
  if (!text.trim()) {
    return { success: false, naturalPortuguese: "" };
  }

  // Check and consume quota
  const hasCredit = useCredit();
  if (!hasCredit) {
    if (options?.onOutOfCredits) options.onOutOfCredits();
    return {
      success: false,
      outOfCredits: true,
      naturalPortuguese: text,
      error: "Cota diária gratuita esgotada. Atualize para o Pro ou insira sua chave gratuita do Google Studio (BYOK).",
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
        text,
        tone,
        model,
        customApiKey,
      }),
    });

    const data: GeminiRefineResponse = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha na requisição";
    return {
      success: false,
      naturalPortuguese: text,
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

  const model = getSelectedModel();
  const customApiKey = getCustomApiKey();

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "reverse",
        text: spokenText,
        model,
        customApiKey,
      }),
    });

    const data: GeminiRefineResponse = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha na tradução reversa";
    return {
      success: false,
      naturalPortuguese: spokenText,
      librasGlosses: spokenText.toUpperCase().split(" "),
      fallback: true,
      error: msg,
    };
  }
}
