# 🤟 HandSpeak — Tradutor Bidirecional de Libras em Tempo Real & Vídeo Chamada Acessível

Plataforma inteligente de tradução bidirecional entre a **Língua Brasileira de Sinais (Libras)** e **Texto/Português**, desenvolvida para quebrar barreiras de comunicação entre pessoas surdas/mudas e pessoas ouvintes. O sistema combina **visão computacional 3D a 60 FPS**, **inteligência artificial generativa**, **assistente anatômico 3D (WebGL)**, **vídeo chamadas P2P em tempo real** e **módulos de moderação e segurança ativa (Trust & Safety)**.

---

## 🌟 Principais Recursos

- 🖐️ **Rastreamento 3D de até 2 Mãos em Tempo Real (60 FPS)**:
  - Visão computacional no navegador via MediaPipe Tasks Vision 3D (`HandLandmarker`).
  - Filtro temporal anti-jitter (EMA - Exponential Moving Average) para máxima estabilidade das falanges.
  - Hospedagem local de binários WASM (`/public/wasm`) com fallback em 4 camadas (GPU Local -> CPU Local -> GPU Remota -> CPU Remota).
- 🔤 **Reconhecimento Híbrido Multimodo**:
  - **Datilologia Completa A-Z**: Todas as 26 letras do alfabeto com isolamento de colisões geométricas (F vs T, A vs S, U vs V, G vs Q, etc.).
  - **Expressões & Palavras**: Sinais de alta frequência (Oi, Sim, Não, Obrigado, Por favor, Bom dia, Ajuda, Amigo, Família, Paz, Casa, Água).
  - **Números 0-10**: Reconhecimento numérico dedicado sem interferência na escrita alfabética.
- ✨ **Autocorreção Semântica e Desambiguação de Libras**:
  - Algoritmo de distância de Levenshtein ponderada com matriz de confusão fonológica de Libras.
  - Correção transparente in-place no buffer ao teclar espaço ou após pausa de ~1.2s de inatividade na soletração.
- 🦾 **Assistente Virtual Anatômico 3D (Tutor WebGL)**:
  - Modelo cibernético 3D com 21 nós articulares e 20 conexões ósseas renderizados via Three.js.
  - Demonstração interativa de qualquer sinal em 360°, controle de órbita, zoom e velocidades (0.5x, 1x, 1.5x).
  - Sequenciador de frases: transforma qualquer resposta digitada em animação de Libras para aprendizado e leitura imediata.
- 📞 **Vídeo Chamada P2P (WebRTC 100% Frontend)**:
  - Conexão direta entre dois dispositivos via PeerJS sem necessidade de servidores de mídia intermediários.
  - Criação rápida de sala por código de 6 caracteres (ex: `HS-7482`) e link compartilhável (`?room=HS-7482`).
  - **Legendas Dinâmicas Flutuantes**: Transcrição de Libras e mensagens digitadas sobrepostas na chamada com tipografia ampliada de alto contraste.
  - **Reações Rápidas de Compreensão Mútua**: Botões de 1 toque (*"👍 Entendi perfeitamente"*, *"🔄 Pode repetir?"*, *"⏳ Um momento..."*, *"👏 Concordo"*, *"❓ Dúvida"*) com feedback tátil e visual sincronizado.
- 🛡️ **Moderação e Segurança em Tempo Real na Transmissão de Vídeo**:
  - Arquitetura híbrida de 2 camadas: filtro local contínuo a cada ~800ms (`video-safety-guard.ts`) + auditoria multimodal periódica a cada 5s (`api.moderation.ts`).
  - Proteção estrita contra conteúdo sexual/nudez, brutalidade gráfica, terror, armas e risco a menores.
  - **Tolerância Zero**: Desfoque instantâneo total (<100ms), desconexão do WebRTC e encerramento da sala ao confirmar violação.
  - Botão de emergência soberano ("🚨 Denunciar / Sair") na barra da chamada.
  - Calibração específica para Libras: movimentos normais de mãos, braços e expressões faciais são preservados sem falsos positivos.
- 🔒 **Guardrails de IA & Proteção contra Injeção de Prompt**:
  - Teto de entrada de 400 caracteres (`MAX_AI_INPUT_LENGTH = 400`).
  - Detecção pré-flight de prompt injections e jailbreaks com neutralização silenciosa (poupando 100% dos créditos/custos).
  - Rate limiting em janela deslizante (30 requisições/minuto) e isolamento por tags XML `<user_input>`.
  - Escudo de saída com redação automática de credenciais e expurgo de tags XSS.
- 💬 **Experiência 100% Visual (Libras -> Texto First)**:
  - Comunicação bilateral limpa sem necessidade de permissões ou dependências de áudio/microfone.
  - Chat integrado com histórico acessível e geração automática de cards de Libras para respostas digitadas.
- 💎 **Modelo Freemium Sustentável**:
  - 15 créditos diários gratuitos renovados a cada 24 horas.
  - Assinatura Pro (R$ 9,90/mês) para uso ilimitado contínuo.

---

## 🚀 Como Executar

### Pré-requisitos
- [Bun](https://bun.sh/) (v1.3+ instalado)
- Câmera habilitada no navegador

### 1. Instalação das Dependências
```bash
bun install
```

### 2. Configuração de Variáveis de Ambiente
Crie um arquivo `.env` para disponibilizar a chave da API do Google Gemini no servidor:
```env
GEMINI_API_KEY=sua_chave_do_google_ai_studio_aqui
```

### 3. Executando em Modo de Desenvolvimento
```bash
bun run dev
```
O aplicativo estará disponível em `http://localhost:5173`.

### 4. Checagem de Tipos e Build de Produção
```bash
bun run typecheck
bun run build
```

---

## 🏛️ Governança Agêntica

O repositório adota padrões rigorosos de engenharia:
- [`AGENTS.md`](./AGENTS.md): Papéis, competências e protocolos das personas agênticas (Visão 3D, Linguística, IA/Guardrails, Acessibilidade/P2P).
- [`RULES.md`](./RULES.md): Regras de performance (60 FPS, WebGL disposal), WCAG 2.2, segurança de IA e chamadas P2P.
- [`MEMORY.md`](./MEMORY.md): Registros de Decisões de Arquitetura (ADRs 001 a 014) e catálogo completo de sinais.
- [`.agents/skills/`](./.agents/skills/): Habilidades agênticas de apoio (`libras-vision`, `gemini-libras`, `accessibility-ux`).

---

## 🐳 Executando com Docker

```bash
docker build -t handspeak .
docker run -p 3000:3000 handspeak
```

---

Desenvolvido com foco absoluto em acessibilidade, segurança e inclusão social. 🤟
