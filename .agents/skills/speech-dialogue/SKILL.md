---
name: speech-dialogue
description: "Habilidade para gestão de áudio, síntese de fala (TTS) e reconhecimento de voz (STT) na Web Speech API para pt-BR"
---

# Speech Dialogue Skill

Esta skill gerencia a entrada e saída de áudio para a comunicação bidirecional entre o sinalizador surdo/mudo e o interlocutor ouvinte.

## 1. Síntese de Fala (Text-to-Speech — TTS)

### Seleção de Vozes em Português do Brasil (`pt-BR`)
O navegador pode retornar múltiplas vozes. Sempre filtre prioritariamente por `lang === 'pt-BR'` ou vozes com nomes como "Luciana", "Felipe", "Google português do Brasil", "Microsoft Maria".
```typescript
export function getBestPtBrVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === "pt-BR" && v.name.includes("Google")) ||
    voices.find(v => v.lang === "pt-BR" && v.name.includes("Natural")) ||
    voices.find(v => v.lang === "pt-BR") ||
    voices.find(v => v.lang.startsWith("pt")) ||
    null
  );
}
```

### Configurações de Fluência
- `rate`: `1.0` (velocidade padrão) com opção de ajuste entre `0.8` (mais pausada) e `1.2`.
- `pitch`: `1.0`.
- Cancelamento prévio: Sempre execute `window.speechSynthesis.cancel()` antes de falar nova sentença para evitar enfileiramento infinito.

## 2. Reconhecimento de Fala (Speech-to-Text — STT)
- Instancie `window.SpeechRecognition || window.webkitSpeechRecognition`.
- Configure `continuous = true` e `interimResults = true`.
- Defina `lang = 'pt-BR'`.
- Ao emitir resultado final (`isFinal`), propague para a linha do tempo do diálogo e chame a tradução reversa para Libras.
