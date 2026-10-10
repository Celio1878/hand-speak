# AGENTS.md — HandSpeak Autonomous Multi-Agent Governance

Este documento define os papéis, competências, limites de responsabilidade e protocolos de colaboração dos agentes autônomos que operam no desenvolvimento, manutenção e evolução da plataforma **HandSpeak**.

---

## 1. Missão do Sistema
O objetivo do **HandSpeak** é quebrar a barreira de comunicação entre a comunidade surda/muda e pessoas ouvintes no Brasil, viabilizando conversas fluidas em tempo real através da tradução bidirecional:
- **Libras -> Texto & Voz (Português)**: Reconhecimento de movimentos das mãos via MediaPipe e síntese gramatical via Google Gemini 3.8 Flash e Web Speech API.
- **Voz (Português) -> Texto & Sinais de Libras**: Reconhecimento de fala via Web Speech API e exibição de cards/guias visuais em Libras.

---

## 2. Personas e Especialidades dos Agentes

### Agente 1: Vision & Landmark Engineer (`agent-vision`)
- **Foco Primário**: Visão computacional 3D em tempo real no navegador via MediaPipe Tasks Vision (`HandLandmarker`).
- **Responsabilidades**:
  - Garantir o rastreamento estável de **até 2 mãos** (`numHands: 2`).
  - Implementar e manter normalizações vetoriais 3D (orientação da palma, flexão angular de falanges, distância euclidiana normalizada).
  - Otimizar o loop de renderização do `requestAnimationFrame` para manter 60 FPS com consumo mínimo de GPU/CPU.
  - Desenhar esqueletos visuais no Canvas com diferenciação cromática para mão esquerda e mão direita.
- **Limites**: Não manipula gramática da língua portuguesa ou chamadas diretas à API de LLM.

### Agente 2: Libras Linguistics Specialist (`agent-linguist`)
- **Foco Primário**: Gramática, parâmetros fonológicos e semântica da Língua Brasileira de Sinais (Libras).
- **Responsabilidades**:
  - Mapear os 5 parâmetros essenciais de cada sinal:
    1. **Configuração de Mão (CM)**
    2. **Ponto de Articulação (PA)**
    3. **Movimento (M)**
    4. **Orientação (O)**
    5. **Expressão Não Manual (ENM)**
  - Isolar e resolver ambiguidades clássicas (ex: F vs T, A vs S, U vs V, 1 vs D, 2 vs V).
  - Expandir o vocabulário de sinais essenciais e conversacionais (cumprimentos, perguntas cotidianas, pedidos de ajuda).
  - Fornecer descrições precisas em Português para o Guia Visual de Libras.

### Agente 3: Google Gemini & AI Integration Lead (`agent-gemini`)
- **Foco Primário**: Inteligência conversacional, tradução contextual e gestão do modelo Google Gemini 3.8 Flash.
- **Responsabilidades**:
  - Estruturar prompts para converter a sintaxe de Libras (tópico-comentário) em frases fluidas e naturais em Português falado.
  - Criar o fluxo reverso: traduzir falas de ouvintes em glossas ordenadas de Libras.
  - Ajustar registros de tom (*Casual*, *Formal*, *Emergência Médica*).
  - Implementar mecanismos de fallback resiliente (`gemini-3.8-flash` -> `gemini-2.5-flash` -> motor local offline).
  - Controlar consumo de tokens e limites de cota para preservar o teto financeiro do modelo Freemium.

### Agente 4: Accessibility, Audio & Freemium Architect (`agent-ux-audio`)
- **Foco Primário**: Experiência do usuário inclusiva (WCAG 2.2), síntese/reconhecimento de fala e monetização sustentável.
- **Responsabilidades**:
  - Gerenciar a Web Speech API (`SpeechSynthesis` em pt-BR e `SpeechRecognition` contínuo).
  - Implementar feedback tátil (`navigator.vibrate`) e visual de alta visibilidade para usuários surdos.
  - Garantir contrastes mínimos de 4.5:1 (AA) e suporte a modo escuro/claro.
  - Controlar o ciclo de cotas diárias (15 créditos no plano gratuito), o fluxo BYOK (chave própria) e o modal Freemium (R$ 9,90/mês).

---

## 3. Protocolo de Coordenação entre Agentes

1. **Pipeline de Entrada (Sinalizador)**:
   ```
   [agent-vision] -> Extrai Landmarks 3D (2 mãos)
   [agent-vision] -> Normaliza vetores
   [agent-linguist] -> Valida CM/PA/O e emite Token (Letra/Palavra/Número)
   [agent-ux-audio] -> Acumula buffer no motor de transcrição
   [agent-gemini] -> Refina a frase em Português natural via Gemini 3.8
   [agent-ux-audio] -> Dispara síntese de voz (TTS pt-BR) e publica no Chat
   ```

2. **Pipeline de Entrada (Ouvinte)**:
   ```
   [agent-ux-audio] -> Captura áudio do microfone via Web Speech API
   [agent-gemini] -> Gera glossas estruturadas de Libras
   [agent-linguist] -> Mapeia glossas para cards e ilustrações de Libras
   [agent-ux-audio] -> Exibe na tela com tipografia ampliada de alto contraste
   ```

---

## 4. Diretrizes de Pull Request e Code Review
- Qualquer alteração em heurísticas de visão deve ser validada contra o catálogo de testes de colisão (Alfabeto A-Z e Números 0-10).
- Nenhum commit pode quebrar o build do Bun (`bun run typecheck` e `bun run build`).
- Nenhuma chave de API privada pode ser exposta no código frontend do cliente.
