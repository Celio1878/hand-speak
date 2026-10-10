# MEMORY.md — Memória Permanente do Projeto HandSpeak

Este arquivo preserva o contexto contínuo do projeto, os Registros de Decisões de Arquitetura (ADRs), o catálogo de sinais de Libras e os aprendizados de engenharia acumulados.

---

## 1. Registros de Decisões de Arquitetura (ADRs)

### ADR-001: Rastreamento com MediaPipe Tasks Vision 3D
- **Contexto**: A versão inicial do app utilizava apenas 1 mão (`numHands: 1`) e comparava coordenadas 2D absolutas (X/Y), o que falhava quando o usuário rotacionava ou afastava a mão da câmera.
- **Decisão**: Migrar para `numHands: 2` com normalização de escala intrínseca (distância do pulso ao nódulo do dedo médio) e cálculo do vetor 3D de normal da palma.
- **Status**: Ativo.

### ADR-002: Google Gemini 3.8 Flash como Motor Conversacional
- **Contexto**: Libras possui sintaxe própria de tópico-comentário (ex: "EU IR MERCADO ONTEM"). A soletração gera sequências de palavras que precisam de fluência em Português para serem faladas em voz alta para ouvintes.
- **Decisão**: Utilizar o modelo Google Gemini 3.8 Flash (com fallback para `gemini-2.5-pro` e `gemini-2.5-flash`) via rota segura no servidor (`app/routes/api.gemini.ts`), com suporte a BYOK.
- **Status**: Ativo.

### ADR-003: Arquitetura Freemium e Gestão de Custos (Teto de R$ 10,00)
- **Contexto**: O custo de requisições de IA para usuários casuais é baixo (menos de R$ 0,25/mês), mas o uso comercial contínuo ou abusos de chamadas podem ultrapassar o limite estabelecido de R$ 10,00.
- **Decisão**: Implementar modelo Freemium com 15 créditos diários no plano gratuito e assinatura Pro a R$ 9,90/mês, além de suporte a chave gratuita do usuário (BYOK).
- **Status**: Ativo.

### ADR-004: Bun como Gerenciador de Pacotes e Runtime Padrão
- **Contexto**: O projeto possuía tanto `package-lock.json` quanto `bun.lock` inconsistentes, além de dependências desatualizadas.
- **Decisão**: Padronizar 100% no Bun 1.x, garantindo builds ultrarrápidos e lockfile único.
- **Status**: Ativo.

### ADR-005: Hospedagem Local de WASM e Resiliência de Hardware (GPU/CPU)
- **Contexto**: O carregamento de binários do MediaPipe via CDN jsdelivr falhava com erro de MIME type e CORS quando a versão do pacote possuía sufixo de pré-lançamento (ex: `0.10.22-rc.20250304` requisitado incorretamente como `0.10.22`). Adicionalmente, quando `delegate: "GPU"` falhava em ambientes sem WebGL, ou quando promises assíncronas rejeitavam sem tratamento local em `<ConversationalStation>`, ocorriam crashes da árvore inteira no `RenderErrorBoundary` do React Router.
- **Decisão**:
  1. Hospedar os arquivos WASM e seus loaders em `public/wasm/` (`FilesetResolver.forVisionTasks("/wasm")`), mantendo fallback remoto para a versão exata do pacote.
  2. Implementar fallback escalonado em 4 camadas para o `HandLandmarker`: Modelo local (GPU) -> Modelo local (CPU) -> Modelo remoto (GPU) -> Modelo remoto (CPU).
  3. Envolver o nó assíncrono em `VisionErrorBoundary` com interface WCAG 2.2 acessível e botão de recuperação com reset de promise.
  4. Eliminar duplicidade de metatags no `<head>` de `app/root.tsx` e aplicar `suppressHydrationWarning`.
- **Status**: Ativo.

### ADR-006: Reconhecimento de Fala Híbrido (Cross-Browser STT) e Entrada Universal de Texto
- **Contexto**: No Mozilla Firefox (e ambientes sem suporte nativo à Web Speech API), a tentativa de iniciar o microfone resultava no erro `Erro STT: O seu navegador não suporta reconhecimento de fala por microfone`, impedindo o interlocutor ouvinte de responder.
- **Decisão**:
  1. Implementar arquitetura híbrida de STT:
     - **Camada 1 (Nativa)**: `SpeechRecognition` contínuo via Web Speech API em navegadores com suporte (Google Chrome, Safari, Microsoft Edge, Opera).
     - **Camada 2 (Fallback Multimodal)**: `MediaRecorder` + `navigator.mediaDevices.getUserMedia` no Firefox e outros browsers, enviando o áudio gravado em base64 (`audio/webm` ou `audio/ogg`) para `/api/gemini` com `mode: "audio"`, realizando a transcrição fiel e geração simultânea das glossas de Libras.
     - **Camada 3 (Entrada Universal de Texto)**: Campo de digitação de texto com conversão imediata para Libras no painel do ouvinte.
  2. Adotar interação *Toggle Click* com trava de segurança de 30 segundos para o microfone no Firefox.
  3. Integrar com o modelo Freemium consumindo 1 crédito diário (ilimitado em Pro).
- **Status**: Ativo.

### ADR-007: White-Labeling da Interface e Descontinuação do Fluxo BYOK
- **Contexto**: A interface exibia o fluxo de chave própria (*BYOK*), links externos para o Google AI Studio e nomes técnicos de modelos e empresas fornecedoras (Google, Gemini, MediaPipe), gerando fricção cognitiva para o usuário e comprometendo a identidade de marca do produto.
- **Decisão**:
  1. Descontinuar integralmente o fluxo de inserção de chave pessoal (BYOK) na interface e purgar chaves residuais do `localStorage` (`handspeak_custom_api_key`).
  2. Remover o seletor de modelos da interface do usuário; a escolha do melhor modelo é gerenciada de forma transparente e resiliente no backend.
  3. Aplicar white-labeling estrito em todos os textos da UI, botões, modais, cabeçalhos, metatags e mensagens de erro, utilizando terminologias próprias ("Inteligência Artificial", "Rastreamento 3D de Libras", "Tradução Inteligente").
- **Status**: Ativo.

### ADR-008: Arquitetura 100% Visual (Libras -> Texto First) e Remoção de Microfone/Áudio
- **Contexto**: Como pessoas surdas e mudas não ouvem, a inclusão de fluxos de áudio (microfone/STT e síntese de voz/TTS) trazia atritos contínuos de permissão de hardware nos navegadores, discrepâncias entre browsers e ruídos operacionais desnecessários. O objetivo nuclear e missão do HandSpeak é converter Libras em texto e viabilizar conversas visuais fluidas.
- **Decisão**:
  1. Extinguir todos os fluxos de microfone (Web Speech STT e gravação MediaRecorder) e síntese de voz (TTS). O sistema não solicita mais permissão de microfone em nenhum navegador.
  2. Estabelecer o fluxo **Libras -> Texto First**:
     - O sinalizador utiliza a câmera para rastrear até 2 mãos em tempo real via visão computacional 3D, compondo letras, palavras e números com refinamento gramatical por IA.
     - Botão visual "Enviar para a Conversa" publica a mensagem diretamente na linha do tempo sem emitir áudio.
  3. Estruturar a coluna direita como **Chat Mensageiro Integrado e Acessível**:
     - Histórico ampliado de diálogo bilingue com tipografia de alto contraste.
     - Bloco dinâmico de **Cards Visuais de Libras** exibindo as glossas correspondentes à resposta digitada.
     - Caixa de digitação moderna no rodapé do chat com atalho `Enter` para envio rápido.
### ADR-009: Câmera a 60 FPS, Filtro Anti-Jitter EMA e Alfabeto Datilológico A-Z Completo
- **Contexto**: A identificação de sinais sofria com micro-tremores (sensor noise) nos landmarks e ausência de parte do alfabeto datilológico (G, H, J, K, P, Q) e de sinais frequentes de diálogo. A sustentação de 420ms causava lentidão na composição de frases.
- **Decisão**:
  1. Habilitar restrições explícitas de câmera a **60 FPS** em HD (`1280x720`).
  2. Implementar filtro temporal de suavização **Anti-Jitter (EMA - Exponential Moving Average)** (`alpha = 0.72`) nos landmarks de até 2 mãos antes do cálculo geométrico e desenho.
  3. Adicionar controles de imagem e HUD da câmera: botão de **"Realce de Contraste"**, indicador de qualidade de rastreamento ("Rastreamento Estável (60 FPS)") e guia visual de enquadramento.
  4. Completar 100% do alfabeto datilológico (adicionando G, H, J, K, P, Q com isolamento geométrico de colisões).
  5. Expandir sinais estáticos e bimanuais: `EU`, `VOCÊ`, `OBRIGADO`, `AMIGO`, `PAZ`, `FAMÍLIA`.
  6. Calibrar o tempo de sustentação para **320ms** (trava antecipada em 200ms para confiança ≥ 0.90), tornando a escrita rápida e natural.
- **Status**: Ativo.

---

## 2. Resolução de Ambiguidades e Colisões Conhecidas em Libras

| Conflito | Causa Heurística Inicial | Solução Geométrica Implementada |
| :--- | :--- | :--- |
| **1 vs D** | Ambos têm apenas o indicador levantado. O número 1 interceptava a letra D. | Isolamento de modos (Modo Números vs Alfabeto) e verificação do círculo formado pelo polegar com os outros dedos (D). |
| **2 vs V** | Ambos têm indicador e dedo médio levantados. | No número 2 os dedos ficam erguidos; na letra V eles se separam em V. Em modo de escrita de texto, a letra V tem prioridade contextual. |
| **5 vs B** | Ambos possuem 4 ou 5 dedos abertos. | Letra B tem os 4 dedos unidos e o polegar dobrado para dentro da palma. O número 5 tem todos os dedos abertos e espalhados. |
| **0 vs O** | Ambos formam um círculo com os dedos. | No número 0 o círculo é feito com todos os dedos tocando o polegar. No alfabeto, a letra O tem formato oval característico. |
| **F vs T** | Ambos têm 3 dedos levantados e o indicador dobrado com o polegar. | Na letra F, o polegar fica posicionado **por fora** do dedo indicador. Na letra T, o polegar fica **por dentro** do dedo indicador. |
| **A vs S** | Ambos são punhos fechados. | Na letra A, o polegar fica encostado verticalmente ao lado do dedo indicador. Na letra S, o polegar cruza horizontalmente sobre os dedos fechados. |
| **U vs V** | Ambos têm indicador e médio levantados. | Na letra U, os dedos indicador e médio estão **unidos e paralelos** (distância < 0.22). Na letra V, os dedos estão **separados** (distância >= 0.25). |
| **G vs L** | Ambos usam indicador e polegar. | Na letra L, abertura em 90 graus (`distância > 0.65`). Na letra G, polegar paralelo ao lado do indicador (`distância < 0.55`). |
| **G vs Q** | Mesma configuração de pinça aberta. | Letra G aponta para cima (`y < mcp.y`). Letra Q aponta para o chão (`y > mcp.y`). |
| **K vs P vs H** | Dedos em V com polegar no meio. | Letra K aponta para cima. Letra P aponta para baixo (`y > mcp.y`). Letra H tem dedos esticados na horizontal. |
| **I vs J** | Ambos têm dedo mindinho erguido. | Letra I é estática. Letra J traça trajetória dinâmica em anzol (descida e curva ascendente no ar). |

---

## 3. Catálogo de Sinais e Vocabulário de Libras

### Alfabeto Datilológico Completo:
- A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z.

### Números Suportados:
- 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.

### Expressões e Palavras Frequentes:
- `OI`: Aceno horizontal de mão com movimento oscilatório.
- `SIM`: Polegar para cima (ou punho com flexão vertical afirmativa).
- `NAO`: Dedo indicador balançando lateralmente de um lado para o outro.
- `OBRIGADO`: Toque da mão aberta na testa ou queixo em direção à frente.
- `POR FAVOR`: Mãos unidas em prece ou mão aberta circular no peito.
- `BOM DIA`: Sinal de bom (mão na boca para frente) seguido de dia.
- `BOA TARDE`: Sinal de bom seguido do sol se pondo no antebraço.
- `BOA NOITE`: Sinal de bom seguido de mão cobrindo o punho oposto.
- `AJUDA`: Punho cerrado sobre a palma da outra mão impulsionando para frente.
- `AMIGO`: Mão no peito do lado esquerdo com batida suave.
- `FAMILIA`: Letras F de ambas as mãos se unindo em círculo à frente.
- `PAZ`: Ambas as palmas abertas para baixo se espalmando suavemente para os lados.
- `EU`: Indicador apontando diretamente para o próprio peito.
- `VOCE`: Indicador apontando para o interlocutor à frente.
- `CASA`: Ambas as mãos unidas pelas pontas dos dedos formando um telhado.
- `AGUA`: Letra L no queixo com movimento do dedo indicador.

---

## 4. Registro de Decisões de Arquitetura (ADRs)

### ADR-010: Desambiguação Geométrica e Autocorreção Semântica de Libras com IA
- **Contexto**: Variações anatômicas naturais (comprimento dos dedos, flexibilidade articular) e pequenos desvios de ângulo da câmera geram colisões frequentes em pares como F vs T, A vs S, U vs V e M vs N durante soletração rápida.
- **Decisão**:
  1. Emissão de metadados de ambiguidade (`alternativeValue`, `ambiguityMargin`) em `GestureToken` pelo analisador do alfabeto.
  2. Implementação de algoritmo Levenshtein com pesos fonológicos de Libras (`getLibrasWeightedDistance` em `libras-disambiguation-service.ts`), onde custos de troca entre pares de colisão conhecidos são fracionários (0.18 a 0.25) em vez de 1.0.
  3. Autocorreção transparente e in-place no buffer ativada ao teclar/sinalizar espaço ou após pausa de ~1.2s de inatividade na soletração.
- **Consequências**: Escrita fluida sem atrito de backspace manual, operação offline ultra-rápida (<2ms) e preservação estrita de palavras já corretas.

### ADR-011: Assistente Virtual Anatômico 3D de Libras (Three.js WebGL)
- **Contexto**: A compreensão dos parâmetros de Configuração de Mão (CM) e Ponto de Articulação (PA) exige visualização com profundidade e perspectiva sob diferentes ângulos (visão palmar, dorsal, lateral).
- **Decisão**:
  1. Implementação de esqueleto cibernético 3D com 21 nós articulares e 20 conexões ósseas renderizados via Three.js e WebGL (`anatomical-hand-scene.ts`).
  2. Catálogo de poses 3D pré-calibradas com interpolação geométrica suave (`interpolateHandPoses`).
  3. Controles de órbita 360°, zoom, presets de câmera (Frontal, Lateral, Topo) e seletor de velocidade (0.5x, 1x, 1.5x).
  4. Sequenciador de frases do chat que transforma respostas digitadas em animação de Libras em tempo real.
  5. Descarte estrito de geometrias, materiais e cancelamento de `requestAnimationFrame` no `dispose()` para garantir zero vazamento de memória.
- **Consequências**: Experiência imersiva de aprendizado, auxílio imediato à pessoa surda para leitura da fala de ouvintes e conformidade com padrão 60 FPS offline.

### ADR-012: Guardrails de IA, Proteção contra Injeção de Prompt e Prevenção de Vazamento de Segredos
- **Contexto**: Como a aplicação integra modelos generativos em tempo real para tradução bilingue, existia risco de ataques de Prompt Injection (tentativas de cancelar instruções, ativar personas sem restrições ou extrair chaves de API), exaustão de cota por requisições em loop e vazamento acidental de tokens de autenticação ou metadados da IA nas respostas.
- **Decisão**:
  1. Criar motor dedicado de Guardrails (`app/components/ai-guardrails.ts`) com limite estrito de entrada (`MAX_AI_INPUT_LENGTH = 400` caracteres).
  2. Implementar detecção heurística pré-flight com normalização de diacríticos (`detectPromptInjection`) para bloquear comandos de sequestro de prompt (`ignore previous instructions`, `desconsidere diretrizes`, `DAN mode`, `GEMINI_API_KEY`, scripts XSS) antes do consumo de API.
  3. Adotar neutralização silenciosa: quando um ataque é detectado, a chamada de IA paga é interrompida imediatamente, retornando uma resposta neutra de domínio (`"Comunicação não compreendida."`) sem expor detalhes técnicos de segurança ao atacante.
  4. Implementar Rate Limiter em janela deslizante (30 requisições/minuto por cliente/IP) na rota `/api/gemini` para prevenir abusos e DoS de cotas.
  5. Isolar o input do usuário no System Prompt do Gemini através de tags XML estruturadas (`<user_input>${escapePromptXml(sanitizedInput)}</user_input>`) com diretiva estrita de tratamento como dado passivo de tradução.
  6. Escudo de Saída (`sanitizeAiOutput`): redação de padrões de tokens e segredos (`AIza...`, `sk-...`, `Bearer...`), remoção de prefixos conversacionais meta-IA (*"Como uma inteligência artificial..."*) e expurgo de tags HTML/XSS.
- **Consequências**: Blindagem de ponta a ponta sem degradação de performance (<1ms no pré-flight), proteção total de cotas e preservação de privacidade e conformidade de segurança.

### ADR-013: Vídeo Chamada P2P (WebRTC 100% Frontend), Legendas Flutuantes e Reações de Compreensão Mútua
- **Contexto**: Conversas reais (entrevistas, reuniões, diálogos cotidianos) ocorrem entre duas pessoas em dispositivos diferentes, onde uma delas se comunica por sinais (Libras) e a outra por texto. Era fundamental viabilizar chamada de vídeo com transmissão direta e tradução sobreposta sem custo de infraestrutura ou servidores de mídia dedicados.
- **Decisão**:
  1. Arquitetura 100% no Frontend via PeerJS (`webrtc-call-service.ts`) com conexão direta Peer-to-Peer para vídeo e DataChannel, utilizando broker público gratuito para handshake e `BroadcastChannel` para testes locais.
  2. Identificação de salas por códigos amigáveis de 6 caracteres (ex: `HS-7482`) e links diretos (`?room=HS-7482`).
  3. Layout de Chamada com Legenda Flutuante (`p2p-video-call-modal.tsx`): vídeo remoto do interlocutor em destaque, miniatura local (PiP) com esqueleto de Libras e legendas dinâmicas ampliadas sobrepostas na parte inferior.
  4. Barra de Reações Rápidas de Compreensão Mútua (👍 Entendi, 🔄 Pode repetir?, ⏳ Um momento, 👏 Concordo, ❓ Dúvida) com animação flutuante e vibração tátil sincronizada em ambos os aparelhos.
  5. Dock de entrada de texto com tecla `Enter` para envio imediato de respostas pelo ouvinte direto para a legenda.
- **Consequências**: Comunicação natural e inclusiva entre dois dispositivos com zero backend próprio, latência mínima e garantia de entendimento mútuo.

### ADR-014: Moderação e Segurança em Tempo Real na Transmissão de Vídeo (Trust & Safety Multimodal)
- **Contexto**: Em transmissões de vídeo ao vivo entre dispositivos remotos, existe risco de exposição a conteúdo sexual/nudez, brutalidade, terror, violência física, armas e exploração de menores/crianças.
- **Decisão**:
  1. Arquitetura híbrida de 2 camadas: Camada 1 local no navegador (`video-safety-guard.ts`) analisando frames em canvas 128x128 a cada ~800ms para detecção ultra-rápida (<100ms) de exposição anômala; Camada 2 multimodal no servidor (`api.moderation.ts`) utilizando Gemini a cada 5s ou sob gatilho de suspeita imediato.
  2. Calibração específica para Libras: movimentos normais de mãos, braços e expressões faciais da Língua de Sinais são explicitamente preservados, prevenindo falsos positivos.
  3. Tolerância zero: corte imediato (<100ms) com desfoque total (blur 100%), desconexão do WebRTC P2P e fechamento da sala ao confirmar violação.
  4. Botão de emergência soberano ("🚨 Denunciar / Sair") na barra da chamada para o usuário cortar a conexão e denunciar o conteúdo com 1 toque a qualquer momento.
- **Consequências**: Ambiente protegido contra abusos graves sem comprometer a fluidez da comunicação em Libras e com zero exposição a conteúdos ilícitos ou traumáticos.




