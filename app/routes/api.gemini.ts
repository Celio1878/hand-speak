import type { ActionFunctionArgs } from "react-router";
import { GoogleGenAI } from "@google/genai";

export type GeminiRefineResponse = {
  success: boolean;
  naturalPortuguese?: string;
  explanation?: string;
  toneUsed?: string;
  suggestedReplies?: string[];
  librasGlosses?: string[];
  recommendedSigns?: string[];
  modelUsed?: string;
  error?: string;
  fallback?: boolean;
};

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const {
      mode = "refine",
      text = "",
      tone = "casual",
      model = "gemini-3.8-flash",
      customApiKey = "",
    } = body;

    const apiKey = customApiKey || process.env.GEMINI_API_KEY || "";

    if (!apiKey) {
      return Response.json({
        success: false,
        fallback: true,
        naturalPortuguese: text,
        error: "Chave da API Gemini não configurada. Usando motor local de regras e dicionário.",
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Choose prompt based on mode
    let systemInstruction = "";
    let promptContent = "";

    if (mode === "reverse") {
      // Speech in Portuguese -> Libras Glosses & Signs
      systemInstruction = `Você é o assistente de transcrição em Libras do HandSpeak.
Receba uma frase em Português falada por um ouvinte e traduza-a para a estrutura gramatical visual de Libras (glossas em maiúsculas na ordem Tópico-Comentário, sem preposições/artigos desnecessários).

Responda SEMPRE em formato JSON estrito exatamente neste formato:
{
  "librasGlosses": ["PALAVRA1", "PALAVRA2", "PALAVRA3"],
  "naturalPortuguese": "Texto em Português claro",
  "recommendedSigns": ["PALAVRA1", "PALAVRA2"]
}`;
      promptContent = `Traduza para Libras a seguinte fala: "${text}"`;
    } else {
      // Libras Tokens/Spelling -> Natural Portuguese
      systemInstruction = `Você é o especialista linguístico do HandSpeak, um tradutor inteligente entre Língua Brasileira de Sinais (Libras) e Português do Brasil.
Você recebe uma sequência de sinais soletrados ou palavras-chave de Libras (ex: "EU PRECISAR REMEDIO", "OI TUDO BEM") e deve produzir uma frase fluente, natural e polida em Português falado para ser lida ou falada por voz sintetizada para uma pessoa ouvinte.

Tom de voz solicitado: ${tone} (casual = cotidiano/amigável; formal = trabalho/entrevistas; emergency = hospital/urgência/socorro).

Responda SEMPRE em formato JSON estrito exatamente neste formato:
{
  "naturalPortuguese": "Frase natural em Português pronta para fala",
  "explanation": "Breve explicação do ajuste",
  "toneUsed": "${tone}",
  "suggestedReplies": ["Sugestão rápida 1", "Sugestão rápida 2"]
}`;
      promptContent = `Traduza a sequência de Libras: "${text}"`;
    }

    // Try primary model, fallback if needed
    const candidateModels = [model, "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"];
    let lastError: unknown = null;

    for (const candidate of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: candidate,
          contents: promptContent,
          config: {
            systemInstruction,
            temperature: 0.2,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
          },
        });

        const rawText = response.text?.trim() || "{}";
        let parsed: Record<string, unknown> = {};

        try {
          parsed = JSON.parse(rawText);
        } catch {
          // If response contains markdown code block ```json ... ```
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            parsed = { naturalPortuguese: rawText };
          }
        }

        return Response.json({
          success: true,
          modelUsed: candidate,
          ...parsed,
        });
      } catch (err: unknown) {
        lastError = err;
        // Continue to fallback model
        continue;
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : "Erro na API Gemini";
    return Response.json({
      success: false,
      fallback: true,
      naturalPortuguese: text,
      error: `Não foi possível consultar o modelo Gemini (${errorMessage}). Utilizando fallback local.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
