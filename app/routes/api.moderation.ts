import type { ActionFunctionArgs } from "react-router";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "~/components/ai-guardrails";

export interface ModerationResult {
  safe: boolean;
  violationType?: "none" | "sexual" | "violence" | "terror" | "weapons" | "child_safety";
  confidence: number;
  reason?: string;
  error?: string;
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ safe: true, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "client-local";

    // Rate Limiting (Máximo 60 inspeções de frames por minuto por cliente)
    const rateCheck = checkRateLimit(`moderation_${clientIp}`, 60, 60000);
    if (!rateCheck.allowed) {
      // Em rate limit, retorna safe para não travar chamada legítima
      return Response.json({
        safe: true,
        confidence: 0.5,
        reason: "Rate limit de moderação atingido temporariamente.",
      });
    }

    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return Response.json({ safe: true, confidence: 1.0 });
    }

    // Remove prefixo de Data URL se presente (ex: data:image/jpeg;base64,)
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

    if (!cleanBase64) {
      return Response.json({ safe: true, confidence: 1.0 });
    }

    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      // Se não houver chave configurada no servidor, mantém operação segura
      return Response.json({
        safe: true,
        confidence: 1.0,
        reason: "Chave de IA não configurada para auditoria remota.",
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `Você é o Agente de Moderação e Segurança de Vídeo em Tempo Real (Trust & Safety) do HandSpeak.
Sua missão é proteger a chamada contra violações inaceitáveis de segurança e integridade humana.

CATEGORIAS ESTRITAS DE VIOLAÇÃO:
1. "sexual": Nudez explícita, órgãos genitais, seios expostos ou atos sexuais.
2. "violence": Brutalidade gráfica, ferimentos graves, sangue excessivo, espancamento ou agressão física real.
3. "terror": Terrorismo, decapitação, tortura ou ameaça terrorista explícita.
4. "weapons": Armas de fogo ou facas empunhadas em postura de ameaça iminente.
5. "child_safety": Qualquer abuso, perigo, exploração ou nudez envolvendo crianças/menores.

CALIBRAÇÃO ESSENCIAL PARA LIBRAS (NÃO CONFUNDIR COM VIOLAÇÃO):
- O HandSpeak é uma aplicação de comunicação por Língua Brasileira de Sinais (Libras).
- Pessoas gesticulando com as mãos e braços, tocando o próprio rosto/peito, fazendo expressões faciais expressivas ou vestindo roupas normais NÃO SÃO VIOLAÇÕES. Devem ser classificadas como "safe": true com "violationType": "none".

Responda SEMPRE em formato JSON estrito:
{
  "safe": true,
  "violationType": "none",
  "confidence": 0.95,
  "reason": "Pessoa sinalizando em Libras normalmente"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: cleanBase64,
          },
        },
        "Avalie com rigor de segurança o frame de vídeo anexado contra violações graves.",
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 250,
      },
    });

    const rawOutput = response.text?.trim() || "";

    try {
      const parsed = JSON.parse(rawOutput) as ModerationResult;
      return Response.json({
        safe: Boolean(parsed.safe),
        violationType: parsed.violationType || (parsed.safe ? "none" : "violence"),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
        reason: parsed.reason || "",
      });
    } catch {
      // Fallback se JSON não for parseado
      const isUnsafe = /"safe"\s*:\s*false/i.test(rawOutput);
      return Response.json({
        safe: !isUnsafe,
        violationType: isUnsafe ? "violence" : "none",
        confidence: 0.8,
      });
    }
  } catch (error: any) {
    console.error("Erro na rota de moderação de vídeo:", error);
    // Em caso de falha de rede da API de moderação, não interrompe a conversa para evitar DoS falso
    return Response.json({
      safe: true,
      confidence: 0.5,
      error: error.message || "Falha na verificação",
    });
  }
}
