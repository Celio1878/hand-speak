import type { ActionFunctionArgs } from "react-router";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "~/components/ai-guardrails";

export type ViolationCategory =
  | "none"
  | "sexual"
  | "drugs"
  | "violence"
  | "terror"
  | "weapons"
  | "child_safety"
  | "alcohol_tobacco";

export interface ModerationResult {
  safe: boolean;
  violationType?: ViolationCategory;
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

    // Rate Limiting (Máximo 120 inspeções de frames por minuto por cliente para suportar taxa de 2.5s)
    const rateCheck = checkRateLimit(`moderation_${clientIp}`, 120, 60000);
    if (!rateCheck.allowed) {
      // Em rate limit temporário, mantém fail-safe para não travar chamada legítima
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
1. "sexual": Nudez explícita, partes íntimas, órgãos genitais, seios expostos, pornografia ou atos sexuais.
2. "drugs": Drogas ilícitas, entorpecentes (cocaína, maconha, comprimidos ilícitos), seringas com substâncias suspeitas ou parafernália de consumo.
3. "violence": Brutalidade gráfica, ferimentos graves, sangue excessivo, espancamento ou agressão física real.
4. "terror": Terrorismo, decapitação, tortura, extremismo violento ou ameaça terrorista explícita.
5. "weapons": Armas de fogo ou facas/armas brancas empunhadas em postura de ameaça iminente.
6. "child_safety": Qualquer abuso, perigo, exploração ou nudez envolvendo crianças/menores.
7. "alcohol_tobacco": Consumo ostensivo ou exibição inadequada de bebidas alcoólicas, cigarros, vapes ou fumo.

CALIBRAÇÃO ESSENCIAL PARA LIBRAS (NÃO CONFUNDIR COM VIOLAÇÃO):
- O HandSpeak é uma aplicação de comunicação por Língua Brasileira de Sinais (Libras).
- Pessoas gesticulando com as mãos e braços, tocando o próprio rosto/peito, fazendo expressões faciais expressivas, usando regatas ou roupas normais de calor NÃO SÃO VIOLAÇÕES. Devem ser classificadas como "safe": true com "violationType": "none".

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
        "Avalie com rigor de segurança o frame de vídeo anexado contra as 7 violações graves.",
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 250,
      },
    });

    // 1. Verificação de Bloqueio Nativo de Segurança do Gemini (SAFETY)
    const firstCandidate = response.candidates?.[0];
    const finishReason = firstCandidate?.finishReason;
    const blockReason = (response.promptFeedback as any)?.blockReason;

    if (finishReason === "SAFETY" || blockReason === "SAFETY") {
      return Response.json({
        safe: false,
        violationType: "sexual",
        confidence: 1.0,
        reason: "Conteúdo bloqueado diretamente pelos filtros de segurança de imagem da IA.",
      });
    }

    let rawOutput = "";
    try {
      rawOutput = response.text?.trim() || "";
    } catch (textAccessError: any) {
      // Se acessar response.text lançar erro por bloqueio de safety
      return Response.json({
        safe: false,
        violationType: "sexual",
        confidence: 1.0,
        reason: "Conteúdo visual bloqueado por restrição de segurança da IA.",
      });
    }

    // 2. Verificação de frases de recusa de segurança do modelo
    const isModelRefusal =
      /cannot fulfill|unable to evaluate|unable to generate|safety policy|explicit content|violates content policy|graphic content/i.test(
        rawOutput
      );
    if (isModelRefusal) {
      return Response.json({
        safe: false,
        violationType: "sexual",
        confidence: 1.0,
        reason: "Conteúdo recusado por violar diretrizes de integridade visual.",
      });
    }

    try {
      const parsed = JSON.parse(rawOutput) as ModerationResult;
      const isExplicitUnsafe = parsed.safe === false;
      return Response.json({
        safe: !isExplicitUnsafe,
        violationType: parsed.violationType || (isExplicitUnsafe ? "sexual" : "none"),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95,
        reason: parsed.reason || "",
      });
    } catch {
      // Fallback inteligente se o JSON vier truncado ou com texto adicional
      const hasUnsafeFlag =
        /"safe"\s*:\s*false/i.test(rawOutput) ||
        /"violationType"\s*:\s*"(sexual|drugs|violence|terror|weapons|child_safety|alcohol_tobacco)"/i.test(
          rawOutput
        );

      let detectedCategory: ViolationCategory = "sexual";
      const catMatch = rawOutput.match(
        /"violationType"\s*:\s*"(sexual|drugs|violence|terror|weapons|child_safety|alcohol_tobacco)"/i
      );
      if (catMatch && catMatch[1]) {
        detectedCategory = catMatch[1].toLowerCase() as ViolationCategory;
      }

      if (hasUnsafeFlag) {
        return Response.json({
          safe: false,
          violationType: detectedCategory,
          confidence: 0.9,
          reason: "Violação de segurança identificada no fluxo de vídeo.",
        });
      }

      // Se não há indicativo de violação, considera seguro
      return Response.json({
        safe: true,
        violationType: "none",
        confidence: 0.85,
      });
    }
  } catch (error: any) {
    console.error("Erro na rota de moderação de vídeo:", error);

    // Se o erro do Google AI decorrer de violação de políticas de segurança
    const isSafetyException =
      /safety|harm|blocked|policy|inappropriate|filtered|prohibited/i.test(
        error?.message || ""
      );

    if (isSafetyException) {
      return Response.json({
        safe: false,
        violationType: "sexual",
        confidence: 1.0,
        reason: "Transmissão interrompida por filtro de segurança de conteúdo visual.",
      });
    }

    // Falhas puras de rede transitória (Fail-Safe transitório para o próximo ciclo de 2.5s)
    return Response.json({
      safe: true,
      confidence: 0.5,
      error: error.message || "Falha temporária na verificação",
    });
  }
}
