---
name: speech-dialogue
description: "Habilidade para gestão de diálogo acessível, entrada universal de texto e histórico de comunicação no HandSpeak"
---

# Speech & Visual Dialogue Skill

Esta skill documenta os padrões de diálogo e comunicação acessível no HandSpeak, cobrindo a transição para a arquitetura **100% Visual (Libras -> Texto First)** e a integração de chamadas de vídeo P2P com legendas dinâmicas.

## 1. Princípio da Comunicação 100% Visual

Como a plataforma é voltada para pessoas surdas e mudas, a experiência padrão elimina atritos e pedidos de permissão de microfone/áudio:
- O sinalizador se comunica através da câmera de Libras (60 FPS com filtro anti-jitter).
- O interlocutor ouvinte responde através do campo de digitação integrado no rodapé do chat.
- Cada resposta digitada é convertida automaticamente em **Cards Visuais de Libras** e pode ser animada em 360° no **Assistente Anatômico 3D (WebGL)**.
- Feedback háptico via `navigator.vibrate` substitui bipes ou alertas sonoros.

## 2. Diálogo em Vídeo Chamadas P2P (WebRTC)

Nas chamadas diretas entre dispositivos diferentes:
- **Legendas Dinâmicas Flutuantes**: Transcrição de Libras do sinalizador e mensagens digitadas pelo interlocutor aparecem sobrepostas em banner de alto contraste.
- **Reações Rápidas de Compreensão Mútua**: Botões de 1 toque (`👍 Entendi`, `🔄 Pode repetir?`, `⏳ Um momento...`, `👏 Concordo`, `❓ Dúvida`) com animação e vibração sincronizada em ambos os aparelhos.
- **Dock de Entrada de Texto**: Permite ao interlocutor enviar respostas com a tecla `Enter` diretamente para a legenda.

## 3. Serviços Legados de Áudio (Preservados em `app/components/speech-service.ts`)

Caso módulos opcionais venham a oferecer síntese de voz auxiliar sob demanda estrita:
- Text-to-Speech (TTS): Vozes em `pt-BR` selecionadas preferencialmente por `lang === 'pt-BR'` e `rate: 1.0`.
- Sempre chamar `window.speechSynthesis.cancel()` antes de novas sentenças.
